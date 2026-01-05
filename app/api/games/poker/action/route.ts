import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth";
import {
  advanceTurn,
  setAllActiveHasActedFalse,
  type PokerState,
  type SeatStack,
} from "@/lib/poker-engine";
import { progressTableState, seatStacksFromSeats } from "@/app/api/games/poker/shared";

export const runtime = "nodejs";

const bodySchema = z.object({
  action: z.enum(["call", "check", "raise", "fold"]),
  raiseTo: z.number().positive().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { action, raiseTo } = parsed.data;
  const userId = session.user.id;
  const now = Date.now();

  try {
    const result = await prisma.$transaction(async (tx) => {
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

      let seats = await tx.pokerSeat.findMany({
        where: { tableId: seat.tableId },
      });
      let state = table.state as PokerState;
      let seatStacks: SeatStack[] = seatStacksFromSeats(seats);
      const preProgress = await progressTableState(tx, table, seats, now);
      state = preProgress.state;
      await tx.pokerTable.update({
        where: { id: table.id },
        data: { state },
      });
      seats = await tx.pokerSeat.findMany({
        where: { tableId: seat.tableId },
      });
      seatStacks = seatStacksFromSeats(seats);
      const seatState = state.seats.find((s) => s.seatIndex === seat.seatIndex);
      if (!seatState || seatState.userId !== userId) {
        throw new Error("Seat mismatch");
      }
      if (state.phase === "waiting") {
        throw new Error("No active hand");
      }
      if (seatState.status !== "active") {
        throw new Error("You are not in the hand");
      }
      if (state.turnIndex !== seat.seatIndex) {
        throw new Error("Not your turn");
      }

      const seatStack = seatStacks.find((s) => s.seatIndex === seat.seatIndex);
      if (!seatStack) {
        throw new Error("Seat stack missing");
      }

      const updateStack = (nextStack: number) => {
        seatStack.stackCents = nextStack;
      };

      if (action === "fold") {
        seatState.status = "folded";
        seatState.hasActed = true;
        seatState.lastAction = "Folded";
        seatState.timeoutCount = 0;
        state = advanceTurn(state, now);
      } else if (action === "check") {
        if (state.currentBet > seatState.betCents) {
          throw new Error("Cannot check");
        }
        seatState.hasActed = true;
        seatState.lastAction = "Checked";
        seatState.timeoutCount = 0;
        state = advanceTurn(state, now);
      } else if (action === "call") {
        const diff = state.currentBet - seatState.betCents;
        if (diff <= 0) {
          seatState.hasActed = true;
          seatState.lastAction = "Checked";
          seatState.timeoutCount = 0;
          state = advanceTurn(state, now);
        } else {
          if (seatStack.stackCents < diff) {
            throw new Error("Insufficient stack to call");
          }
          seatState.betCents += diff;
          seatState.hasActed = true;
          seatState.lastAction = "Called";
          seatState.timeoutCount = 0;
          updateStack(seatStack.stackCents - diff);
          state.potCents += diff;
          if (seatStack.stackCents - diff === 0) {
            seatState.status = "allin";
          }
          state = advanceTurn(state, now);
        }
      } else if (action === "raise") {
        if (!raiseTo || !Number.isFinite(raiseTo)) {
          throw new Error("Raise amount required");
        }
        const raiseToCents = Math.round(raiseTo * 100);
        const minAllowed = state.currentBet + state.minRaise;
        if (raiseToCents < minAllowed) {
          throw new Error(`Minimum raise is ${minAllowed / 100}`);
        }
        const diff = raiseToCents - seatState.betCents;
        if (diff <= 0) {
          throw new Error("Raise too small");
        }
        if (seatStack.stackCents < diff) {
          throw new Error("Insufficient stack to raise");
        }
        const prevBet = state.currentBet;
        const actionLabel = prevBet === 0 ? "Bet" : "Raised";
        seatState.betCents = raiseToCents;
        seatState.hasActed = true;
        seatState.lastAction = actionLabel;
        seatState.timeoutCount = 0;
        state.potCents += diff;
        updateStack(seatStack.stackCents - diff);
        if (seatStack.stackCents - diff === 0) {
          seatState.status = "allin";
        }
        state.currentBet = raiseToCents;
        state.minRaise = Math.max(state.minRaise, raiseToCents - prevBet);
        state.lastAggressorIndex = seat.seatIndex;
        state = setAllActiveHasActedFalse(state, seat.seatIndex);
        state = advanceTurn(state, now);
      }

      await tx.pokerSeat.update({
        where: { id: seat.id },
        data: { stackCents: seatStack.stackCents },
      });

      seats = await tx.pokerSeat.findMany({
        where: { tableId: seat.tableId },
      });
      const progressed = await progressTableState(tx, { ...table, state }, seats, now);
      await tx.pokerTable.update({
        where: { id: table.id },
        data: { state: progressed.state },
      });

      return { ok: true };
    });

    return NextResponse.json(result);
  } catch (err: any) {
    const message = err?.message ?? "Unable to act";
    const status =
      message === "Not your turn" ||
      message === "You are not seated" ||
      message === "No active hand" ||
      message === "Cannot check" ||
      message === "Insufficient stack to call" ||
      message === "Insufficient stack to raise" ||
      message === "Raise amount required" ||
      message.startsWith("Minimum raise") ||
      message === "Seat mismatch" ||
      message === "You are not in the hand"
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
