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
  const recipient = typeof body?.recipient === "string" ? body.recipient.trim() : "";
  const rawAmount = body?.amount;
  const amountNumber = typeof rawAmount === "number" ? rawAmount : Number(rawAmount);

  if (!recipient) {
    return NextResponse.json({ error: "Recipient required" }, { status: 400 });
  }
  if (!Number.isFinite(amountNumber)) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const cents = Math.round(amountNumber * 100);
  if (!Number.isFinite(cents) || cents <= 0 || cents > 1_000_000) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const senderId = session.user.id;
  const recipientUser = await prisma.user.findFirst({
    where: {
      OR: [{ username: recipient }, { email: recipient }],
    },
    select: { id: true },
  });
  if (!recipientUser) {
    return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
  }
  if (recipientUser.id === senderId) {
    return NextResponse.json({ error: "Cannot send to yourself" }, { status: 400 });
  }

  const amt = BigInt(cents);

  try {
    await prisma.$transaction(async (tx) => {
      const senderWallet =
        (await tx.wallet.findFirst({
          where: { userId: senderId, currency: "USD" },
        })) ??
        (await tx.wallet.create({
          data: { userId: senderId, currency: "USD" },
        }));

      if (senderWallet.balance < amt) {
        throw new Error("Insufficient balance");
      }

      const recipientWallet =
        (await tx.wallet.findFirst({
          where: { userId: recipientUser.id, currency: "USD" },
        })) ??
        (await tx.wallet.create({
          data: { userId: recipientUser.id, currency: "USD" },
        }));

      await tx.wallet.update({
        where: { id: senderWallet.id },
        data: { balance: senderWallet.balance - amt },
      });

      await tx.wallet.update({
        where: { id: recipientWallet.id },
        data: { balance: recipientWallet.balance + amt },
      });

      await tx.ledgerEntry.create({
        data: {
          walletId: senderWallet.id,
          amount: -amt,
          kind: "transfer_out",
          refId: recipientUser.id,
        },
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: recipientWallet.id,
          amount: amt,
          kind: "transfer_in",
          refId: senderId,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const message = err?.message ?? "Transfer failed";
    const status = message === "Insufficient balance" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
