import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth";
import { MAX_SEATS, createTableState, normalizeSeats } from "@/lib/poker-engine";
import { progressTableState } from "@/app/api/games/poker/shared";

export const runtime = "nodejs";

const BUY_INS = [100, 1000, 10000] as const;

const bodySchema = z.object({
  buyIn: z.number().int().positive(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success || !BUY_INS.includes(parsed.data.buyIn as (typeof BUY_INS)[number])) {
    return NextResponse.json({ error: "Invalid buy-in" }, { status: 400 });
  }

  const buyIn = parsed.data.buyIn;
  const buyInCents = buyIn * 100;
  const userId = session.user.id;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingSeat = await tx.pokerSeat.findFirst({
        where: { userId },
      });
      if (existingSeat) {
        throw new Error("Already seated");
      }

      let table = await tx.pokerTable.findUnique({
        where: { buyInCents },
        include: { seats: true },
      });
      if (!table) {
        table = await tx.pokerTable.create({
          data: {
            buyInCents,
            state: createTableState(buyInCents),
          },
          include: { seats: true },
        });
      }

      const seats = await tx.pokerSeat.findMany({
        where: { tableId: table.id },
        orderBy: { seatIndex: "asc" },
      });
      if (seats.length >= MAX_SEATS) {
        throw new Error("Table is full");
      }

      const taken = new Set(seats.map((seat) => seat.seatIndex));
      let seatIndex = 0;
      while (taken.has(seatIndex) && seatIndex < MAX_SEATS) seatIndex += 1;
      if (seatIndex >= MAX_SEATS) {
        throw new Error("Table is full");
      }

      let wallet = await tx.wallet.findFirst({
        where: { userId, currency: "USD" },
      });
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { userId, currency: "USD" },
        });
      }

      const buyInBigInt = BigInt(buyInCents);
      if (wallet.balance < buyInBigInt) {
        throw new Error("Insufficient balance");
      }

      const seat = await tx.pokerSeat.create({
        data: {
          tableId: table.id,
          userId,
          seatIndex,
          stackCents: buyInCents,
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: wallet.balance - buyInBigInt },
      });

      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          amount: -buyInBigInt,
          kind: "poker_buyin",
          refId: seat.id,
        },
      });

      const allSeats = [...seats, seat];
      const seatStacks: SeatStack[] = allSeats.map((s) => ({
        seatIndex: s.seatIndex,
        userId: s.userId,
        stackCents: s.stackCents,
      }));

      let nextState = normalizeSeats(table.state as any, seatStacks);
      const seatState = nextState.seats.find((s) => s.seatIndex === seatIndex);
      if (seatState && nextState.phase !== "waiting") {
        seatState.status = "out";
        seatState.hand = [];
        seatState.betCents = 0;
        seatState.hasActed = false;
      }

      const latestSeats = await tx.pokerSeat.findMany({
        where: { tableId: table.id },
      });
      const progressed = await progressTableState(tx, { ...table, state: nextState }, latestSeats, Date.now());

      await tx.pokerTable.update({
        where: { id: table.id },
        data: { state: progressed.state },
      });

      return {
        tableId: table.id,
        seatIndex,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    const message = err?.message ?? "Unable to join table";
    const status =
      message === "Insufficient balance" || message === "Already seated" || message === "Table is full"
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
