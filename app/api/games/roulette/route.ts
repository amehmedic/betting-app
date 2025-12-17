import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { z } from "zod";
import { spinWheel, evaluateBet, type RouletteBet, type RouletteValue } from "@/lib/roulette";

const betSchema = z.object({
  type: z.enum([
    "straight",
    "split",
    "corner",
    "color",
    "parity",
    "range",
    "dozen",
    "column",
  ]),
  pick: z.any(),
  amount: z.number().positive().max(1_000_000),
});

const requestSchema = z.object({
  bets: z.array(betSchema).min(1),
});

export const runtime = "nodejs";

function normalizeBet(bet: any): RouletteBet | null {
  const amount = Number(bet.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  switch (bet.type) {
    case "straight": {
      const pick: RouletteValue = bet.pick === "00" ? "00" : Number(bet.pick);
      if (pick === "00" || (Number.isInteger(pick) && pick >= 0 && pick <= 36)) {
        return { type: "straight", pick, amount };
      }
      return null;
    }
    case "split": {
      const arr = Array.isArray(bet.pick) ? bet.pick : [];
      const picks: RouletteValue[] = arr
        .map((p: any) => (p === "00" ? "00" : Number(p)))
        .filter((p: any) => p === "00" || (Number.isInteger(p) && p >= 0 && p <= 36));
      if (picks.length === 2) return { type: "split", pick: picks, amount };
      return null;
    }
    case "corner": {
      const arr = Array.isArray(bet.pick) ? bet.pick : [];
      const picks: RouletteValue[] = arr
        .map((p: any) => (p === "00" ? "00" : Number(p)))
        .filter((p: any) => p === "00" || (Number.isInteger(p) && p >= 0 && p <= 36));
      if (picks.length === 4) return { type: "corner", pick: picks, amount };
      return null;
    }
    case "color": {
      if (bet.pick === "red" || bet.pick === "black") return { type: "color", pick: bet.pick, amount };
      return null;
    }
    case "parity": {
      if (bet.pick === "odd" || bet.pick === "even") return { type: "parity", pick: bet.pick, amount };
      return null;
    }
    case "range": {
      if (bet.pick === "low" || bet.pick === "high") return { type: "range", pick: bet.pick, amount };
      return null;
    }
    case "dozen": {
      const pick = Number(bet.pick);
      if (pick === 1 || pick === 2 || pick === 3) return { type: "dozen", pick, amount };
      return null;
    }
    case "column": {
      const pick = Number(bet.pick);
      if (pick === 1 || pick === 2 || pick === 3) return { type: "column", pick, amount };
      return null;
    }
    default:
      return null;
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const bets: RouletteBet[] = [];
  for (const b of parsed.data.bets) {
    const norm = normalizeBet(b);
    if (norm) bets.push(norm);
  }
  if (bets.length === 0) {
    return NextResponse.json({ error: "No valid bets" }, { status: 400 });
  }

  const stakeCents = bets.reduce((sum, b) => sum + Math.round(b.amount * 100), 0);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findFirst({ where: { userId: session.user.id, currency: "USD" } });
      if (!wallet || wallet.balance < BigInt(stakeCents)) {
        return { type: "error" as const, response: NextResponse.json({ error: "Insufficient balance" }, { status: 400 }) };
      }

      const spin = spinWheel();
      const payouts = bets.map((bet) => evaluateBet(bet, spin));
      const totalPayout = payouts.reduce((sum, v) => sum + v, 0);
      const totalPayoutCents = Math.round(totalPayout * 100);

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { decrement: BigInt(stakeCents) },
        },
      });

      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          amount: BigInt(-stakeCents),
          kind: "roulette_bet",
          refId: `roulette:${Date.now()}`,
        },
      });

      if (totalPayoutCents > 0) {
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: BigInt(totalPayoutCents) } },
        });
        await tx.ledgerEntry.create({
          data: {
            walletId: wallet.id,
            amount: BigInt(totalPayoutCents),
            kind: "roulette_win",
            refId: `roulette:${Date.now()}`,
          },
        });
      }

      const finalWallet = await tx.wallet.findUnique({ where: { id: wallet.id } });

      return {
        type: "ok" as const,
        spin,
        payouts,
        totalPayout,
        totalStake: stakeCents / 100,
        wallet: finalWallet,
      };
    });

    if (result.type === "error") return result.response;

    return NextResponse.json({
      ok: true,
      spin: result.spin,
      payouts: result.payouts,
      totalPayout: result.totalPayout,
      totalStake: result.totalStake,
      wallet: result.wallet
        ? {
            id: result.wallet.id,
            balance: result.wallet.balance.toString(),
            held: result.wallet.held.toString(),
            currency: result.wallet.currency,
          }
        : null,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to place bets" }, { status: 500 });
  }
}
