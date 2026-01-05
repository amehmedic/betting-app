import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth";
import { normalizeSeats } from "@/lib/poker-engine";

export const runtime = "nodejs";

export async function POST() {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    await prisma.$transaction(async (tx) => {
      const seat = await tx.pokerSeat.findFirst({
        where: { userId },
      });
      if (!seat) {
        throw new Error("You are not seated");
      }

      const table = await tx.pokerTable.findUnique({
        where: { id: seat.tableId },
      });
      if (!table) {
        throw new Error("Table not found");
      }

      let wallet = await tx.wallet.findFirst({
        where: { userId, currency: "USD" },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { userId, currency: "USD" },
        });
      }

      const refund = BigInt(seat.stackCents);
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: wallet.balance + refund },
      });

      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          amount: refund,
          kind: "poker_cashout",
          refId: seat.id,
        },
      });

      await tx.pokerSeat.delete({
        where: { id: seat.id },
      });

      const remainingSeats = await tx.pokerSeat.findMany({
        where: { tableId: seat.tableId },
      });

      const seatStacks = remainingSeats.map((s) => ({
        seatIndex: s.seatIndex,
        userId: s.userId,
        stackCents: s.stackCents,
      }));
      const nextState = normalizeSeats(table.state as any, seatStacks);

      await tx.pokerTable.update({
        where: { id: table.id },
        data: { state: nextState },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const message = err?.message ?? "Unable to leave table";
    const status = message === "You are not seated" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
