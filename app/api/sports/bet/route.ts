import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth";

const bodySchema = z.object({
  matchId: z.string().min(1),
  pick: z.enum(["home", "draw", "away"]),
  amount: z.number().positive(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid bet payload" }, { status: 400 });
  }

  const { matchId, pick, amount } = parsed.data;
  const amountCents = Math.round(amount * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > 1_000_000) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const match = await tx.sportsMatch.findUnique({
        where: { id: matchId },
      });
      if (!match) {
        throw new Error("Match not found");
      }
      if (match.status !== "scheduled") {
        throw new Error("Match is not open for betting");
      }
      if (match.startTime.getTime() <= Date.now()) {
        throw new Error("Match already started");
      }

      if (pick === "draw" && match.oddsDraw <= 0) {
        throw new Error("Draw is not available for this match");
      }
      const odds =
        pick === "home" ? match.oddsHome : pick === "draw" ? match.oddsDraw : match.oddsAway;
      if (odds <= 0) {
        throw new Error("Invalid odds for selected pick");
      }

      const wallet =
        (await tx.wallet.findFirst({
          where: { userId: session.user.id, currency: "USD" },
        })) ??
        (await tx.wallet.create({
          data: { userId: session.user.id, currency: "USD" },
        }));

      const stake = BigInt(amountCents);
      if (wallet.balance < stake) {
        throw new Error("Insufficient balance");
      }

      const bet = await tx.sportsBet.create({
        data: {
          userId: session.user.id,
          matchId,
          pick,
          odds,
          stakeCents: amountCents,
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: wallet.balance - stake },
      });

      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          amount: -stake,
          kind: "sports_bet_stake",
          refId: bet.id,
        },
      });

      return bet.id;
    });

    return NextResponse.json({ ok: true, betId: result });
  } catch (err: any) {
    const message = err?.message ?? "Unable to place bet";
    const status =
      message === "Insufficient balance" ||
      message === "Match already started" ||
      message === "Match is not open for betting" ||
      message === "Match not found"
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
