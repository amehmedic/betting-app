import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { z } from "zod";

export const runtime = "nodejs";

const betSchema = z.object({
  amount: z.number().positive().max(1_000_000),
});

const SYMBOLS = [
  { id: "BAR", label: "Bar", multiplier: 5 },
  { id: "BELL", label: "Bell", multiplier: 6 },
  { id: "CHERRY", label: "Cherry", multiplier: 4 },
  { id: "DIAMOND", label: "Diamond", multiplier: 9 },
  { id: "GRAPES", label: "Grapes", multiplier: 5 },
  { id: "LEMON", label: "Lemon", multiplier: 3 },
  { id: "ORANGE", label: "Orange", multiplier: 4 },
  { id: "SEVEN", label: "Seven", multiplier: 8 },
] as const;

function randomIndex(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return Math.floor((buf[0] / 0x100000000) * max);
}

export async function POST(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = betSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid bet" }, { status: 400 });
  }

  const { amount } = parsed.data;
  const userId = session.user.id;

  let wallet = await prisma.wallet.findFirst({
    where: { userId, currency: "USD" },
  });
  if (!wallet) {
    wallet = await prisma.wallet.create({
      data: { userId, currency: "USD" },
    });
  }

  const stakeCents = BigInt(Math.round(amount * 100));
  if (wallet.balance < stakeCents) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
  }

  const reels = Array.from({ length: 3 }, () => SYMBOLS[randomIndex(SYMBOLS.length)]);
  const isWin = reels.every((symbol) => symbol.id === reels[0].id);
  const multiplier = isWin ? reels[0].multiplier : 0;
  const payoutCents = stakeCents * BigInt(multiplier);

  const updated = await prisma.$transaction(async (tx) => {
    const w1 = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: wallet.balance - stakeCents },
    });

    await tx.ledgerEntry.create({
      data: {
        walletId: wallet.id,
        amount: -stakeCents,
        kind: "slots_bet",
        refId: reels.map((r) => r.id).join("-"),
      },
    });

    if (!isWin || payoutCents === BigInt(0)) return w1;

    const w2 = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: w1.balance + payoutCents },
    });

    await tx.ledgerEntry.create({
      data: {
        walletId: wallet.id,
        amount: payoutCents,
        kind: "slots_win",
        refId: reels.map((r) => r.id).join("-"),
      },
    });

    return w2;
  });

  return NextResponse.json({
    ok: true,
    reels: reels.map((r) => r.id),
    win: isWin,
    multiplier,
    payout: Number(payoutCents) / 100,
    wallet: {
      ...updated,
      balance: updated.balance.toString(),
      held: updated.held.toString(),
    },
  });
}
