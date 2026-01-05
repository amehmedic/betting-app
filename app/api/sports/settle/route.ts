import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth";

const bodySchema = z.object({
  matchId: z.string().min(1),
  result: z.enum(["home", "draw", "away", "void"]),
});

export async function POST(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = (session.user as any)?.role === "admin" || process.env.NODE_ENV === "development";
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid settlement" }, { status: 400 });
  }

  const { matchId, result } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const match = await tx.sportsMatch.findUnique({
        where: { id: matchId },
      });
      if (!match) throw new Error("Match not found");
      if (match.status === "finished") throw new Error("Match already settled");

      await tx.sportsMatch.update({
        where: { id: matchId },
        data: { status: "finished", result },
      });

      const pendingBets = await tx.sportsBet.findMany({
        where: { matchId, status: "pending" },
      });

      for (const bet of pendingBets) {
        let status = "lost";
        let payoutCents = 0;
        if (result === "void") {
          status = "void";
          payoutCents = bet.stakeCents;
        } else if (bet.pick === result) {
          status = "won";
          payoutCents = Math.round((bet.stakeCents * bet.odds) / 100);
        }

        await tx.sportsBet.update({
          where: { id: bet.id },
          data: {
            status,
            payoutCents,
            settledAt: new Date(),
          },
        });

        if (payoutCents > 0) {
          const wallet =
            (await tx.wallet.findFirst({
              where: { userId: bet.userId, currency: "USD" },
            })) ??
            (await tx.wallet.create({
              data: { userId: bet.userId, currency: "USD" },
            }));

          await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: wallet.balance + BigInt(payoutCents) },
          });

          await tx.ledgerEntry.create({
            data: {
              walletId: wallet.id,
              amount: BigInt(payoutCents),
              kind: status === "void" ? "sports_bet_void" : "sports_bet_win",
              refId: bet.id,
            },
          });
        }
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const message = err?.message ?? "Settlement failed";
    const status =
      message === "Match not found" || message === "Match already settled" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
