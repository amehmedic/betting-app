import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth";
import {
  LUCKY6_COLORS,
  runLucky6Draw,
  colorPayoutForPosition,
  isEven,
  isHigh,
  Lucky6Color,
} from "@/lib/lucky6";

export const runtime = "nodejs";

const betSchema = z.object({
  type: z.enum(["first-parity", "first-high-low", "color-six"]),
  pick: z.string(),
  amount: z.number().positive().max(1_000_000),
});

const bodySchema = z.object({
  bets: z.array(betSchema).min(1),
});

type NormalizedBet =
  | {
      type: "first-parity";
      pick: "even" | "odd";
      amount: number;
    }
  | {
      type: "first-high-low";
      pick: "high" | "low";
      amount: number;
    }
  | {
      type: "color-six";
      pick: Lucky6Color;
      amount: number;
    };

const PARITY_MULTIPLIER = 1.8;
const HIGH_LOW_MULTIPLIER = 1.8;

export async function POST(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid bet slip" }, { status: 400 });
  }

  const normalized: NormalizedBet[] = [];

  for (const bet of parsed.data.bets) {
    if (bet.type === "first-parity") {
      const pick = bet.pick.toLowerCase();
      if (pick !== "even" && pick !== "odd") {
        return NextResponse.json({ error: "Invalid parity pick" }, { status: 400 });
      }
      normalized.push({ type: "first-parity", pick, amount: bet.amount });
    } else if (bet.type === "first-high-low") {
      const pick = bet.pick.toLowerCase();
      if (pick !== "high" && pick !== "low") {
        return NextResponse.json({ error: "Invalid high/low pick" }, { status: 400 });
      }
      normalized.push({ type: "first-high-low", pick, amount: bet.amount });
    } else if (bet.type === "color-six") {
      const pick = bet.pick.toLowerCase() as Lucky6Color;
      if (!LUCKY6_COLORS.includes(pick)) {
        return NextResponse.json({ error: "Invalid color pick" }, { status: 400 });
      }
      normalized.push({ type: "color-six", pick, amount: bet.amount });
    }
  }

  const wallet = await prisma.wallet.findFirst({
    where: { userId: session.user.id, currency: "USD" },
  });

  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  const stakes = normalized.map((bet) => Math.round(bet.amount * 100));
  const totalStakeCents = stakes.reduce((sum, cents) => sum + cents, 0);

  if (totalStakeCents <= 0) {
    return NextResponse.json({ error: "Total stake must be positive" }, { status: 400 });
  }

  const totalStakeBigInt = BigInt(totalStakeCents);
  if (wallet.balance < totalStakeBigInt) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
  }

  const draw = runLucky6Draw();
  const firstBall = draw.balls[0];

  const betResults = normalized.map((bet, idx) => {
    const stakeCents = stakes[idx];
    let win = false;
    let multiplier = 0;
    let position: number | null = null;

    if (bet.type === "first-parity") {
      const even = isEven(firstBall.number);
      win = bet.pick === "even" ? even : !even;
      multiplier = win ? PARITY_MULTIPLIER : 0;
    } else if (bet.type === "first-high-low") {
      const high = isHigh(firstBall.number);
      win = bet.pick === "high" ? high : !high;
      multiplier = win ? HIGH_LOW_MULTIPLIER : 0;
    } else {
      position = draw.completionOrder[bet.pick] ?? null;
      multiplier = position ? colorPayoutForPosition(position) ?? 0 : 0;
      win = multiplier > 0;
    }

    const payoutCents = win ? Math.round(stakeCents * multiplier) : 0;

    return {
      type: bet.type,
      pick: bet.pick,
      amount: bet.amount,
      stakeCents,
      win,
      multiplier,
      payoutCents,
      completionPosition: position,
    };
  });

  const totalPayoutCents = betResults.reduce((sum, bet) => sum + bet.payoutCents, 0);
  const totalPayoutBigInt = BigInt(totalPayoutCents);

  const refId = `lucky6:${Date.now()}`;

  const updatedWallet = await prisma.$transaction(async (tx) => {
    const updated = await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: wallet.balance - totalStakeBigInt + totalPayoutBigInt,
      },
    });

    await tx.ledgerEntry.create({
      data: {
        walletId: wallet.id,
        amount: -totalStakeBigInt,
        kind: "lucky6_bet",
        refId,
      },
    });

    if (totalPayoutCents > 0) {
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          amount: totalPayoutBigInt,
          kind: "lucky6_win",
          refId,
        },
      });
    }

    return updated;
  });

  return NextResponse.json({
    ok: true,
    draw: {
      balls: draw.balls,
      completionOrder: draw.completionOrder,
      firstBall,
    },
    bets: betResults.map((bet) => ({
      type: bet.type,
      pick: bet.pick,
      amount: bet.amount,
      win: bet.win,
      multiplier: bet.multiplier,
      completionPosition: bet.completionPosition,
      payout: bet.payoutCents / 100,
    })),
    totals: {
      stake: totalStakeCents / 100,
      payout: totalPayoutCents / 100,
    },
    wallet: {
      balance: updatedWallet.balance.toString(),
      held: updatedWallet.held.toString(),
    },
  });
}
