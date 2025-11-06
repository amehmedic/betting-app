import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { z } from "zod";

// Keep Node runtime (for crypto + Prisma)
export const runtime = "nodejs";

const betSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  pick: z.enum(["heads", "tails"]),
});

function randBit(): 0 | 1 {
  // Use Web Crypto (available in Node 18+ & Next.js route handlers)
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return (n[0] & 1) as 0 | 1;
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
  const { amount, pick } = parsed.data;
  const userId = session.user.id;

  // Find the USD wallet
  const wallet = await prisma.wallet.findFirst({
    where: { userId, currency: "USD" },
  });
  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  const amt = BigInt(Math.round(amount * 100)); // converts $ to cents
  if (wallet.balance < amt) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
  }

  // Flip the coin
  const flip = randBit(); // 0 or 1
  const outcome: "heads" | "tails" = flip === 0 ? "heads" : "tails";
  const win = outcome === pick;

  // Transaction: debit bet; if win, credit 2x bet
  const updated = await prisma.$transaction(async (tx) => {
    // Debit bet
    const w1 = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: wallet.balance - amt },
    });

    await tx.ledgerEntry.create({
      data: {
        walletId: wallet.id,
        amount: -amt, // negative = debit
        kind: "coin_bet",
        refId: pick, // store pick
      },
    });

    if (!win) return w1;

    const prize = amt * BigInt(2); // even payout (no house edge)
    const w2 = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: w1.balance + prize },
    });

    await tx.ledgerEntry.create({
      data: {
        walletId: wallet.id,
        amount: prize,
        kind: "coin_win",
        refId: outcome,
      },
    });

    return w2;
  });

  return NextResponse.json({
    ok: true,
    outcome,
    win,
    wallet: {
      ...updated,
      balance: updated.balance.toString(),
      held: updated.held.toString(),
    },
  });
}

export async function GET() {
  // optional: last 10 coin entries
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const wallet = await prisma.wallet.findFirst({
    where: { userId: session.user.id, currency: "USD" },
  });
  if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

  const ledger = await prisma.ledgerEntry.findMany({
    where: {
      walletId: wallet.id,
      kind: { in: ["coin_bet", "coin_win"] },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json(
    JSON.parse(JSON.stringify(ledger, (_k, v) => (typeof v === "bigint" ? v.toString() : v)))
  );
}