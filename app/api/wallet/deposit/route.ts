import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authConfig); // ← v4 style
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { amount } = await req.json().catch(() => ({}));
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0 || amt > 1_000_000) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const wallet = await prisma.wallet.findFirst({
    where: { userId: session.user.id, currency: "PLAY" },
  });
  if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

  const updated = await prisma.$transaction(async (tx) => {
    const w = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: wallet.balance + BigInt(amt) },
    });
    await tx.ledgerEntry.create({
      data: { walletId: wallet.id, amount: BigInt(amt), kind: "deposit", refId: "faucet" },
    });
    return w;
  });

  return NextResponse.json({
    ok: true,
    wallet: { ...updated, balance: updated.balance.toString(), held: updated.held.toString() },
  });
}