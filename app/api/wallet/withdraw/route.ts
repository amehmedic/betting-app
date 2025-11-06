import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const rawAmount = body?.amount;
  const amountNumber =
    typeof rawAmount === "number" ? rawAmount : Number(rawAmount);

  if (!Number.isFinite(amountNumber)) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const cents = Math.round(amountNumber * 100);
  if (!Number.isFinite(cents) || cents <= 0 || cents > 1_000_000) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const amt = BigInt(cents);

  const wallet =
    (await prisma.wallet.findFirst({
      where: { userId: session.user.id, currency: "USD" },
    })) ??
    (await prisma.wallet.create({
      data: { userId: session.user.id, currency: "USD" },
    }));

  if (wallet.balance < amt) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const w = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: wallet.balance - amt },
    });

    await tx.ledgerEntry.create({
      data: { walletId: wallet.id, amount: -amt, kind: "withdrawal" },
    });

    return w;
  });

  return NextResponse.json({
    ok: true,
    wallet: {
      ...updated,
      balance: updated.balance.toString(),
      held: updated.held.toString(),
    },
  });
}
