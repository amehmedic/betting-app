import type { Prisma } from "@prisma/client";
import type { PokerSeat } from "@prisma/client";
import type { PokerState, SeatStack } from "@/lib/poker-engine";
import {
  applyTimeout,
  canCloseBetting,
  createTableState,
  normalizeSeats,
  remainingActiveCount,
  resolveShowdown,
  startHand,
  advanceTurn,
  advancePhase,
  type PokerSeatStatus,
} from "@/lib/poker-engine";

export function seatStacksFromSeats(seats: PokerSeat[]): SeatStack[] {
  return seats.map((seat) => ({
    seatIndex: seat.seatIndex,
    userId: seat.userId,
    stackCents: seat.stackCents,
  }));
}

async function removeTimedOutSeats(
  tx: Prisma.TransactionClient,
  tableId: string,
  seats: PokerSeat[],
  state: PokerState
) {
  const timedOutIndices = new Set(
    state.seats.filter((seat) => (seat.timeoutCount ?? 0) >= 2).map((seat) => seat.seatIndex)
  );
  if (timedOutIndices.size === 0) {
    return { seats, state, didRemove: false };
  }

  const seatsToRemove = seats.filter((seat) => timedOutIndices.has(seat.seatIndex));
  for (const seat of seatsToRemove) {
    let wallet = await tx.wallet.findFirst({
      where: { userId: seat.userId, currency: "USD" },
    });
    if (!wallet) {
      wallet = await tx.wallet.create({
        data: { userId: seat.userId, currency: "USD" },
      });
    }

    const refund = BigInt(seat.stackCents);
    if (refund > 0n) {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: wallet.balance + refund },
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          amount: refund,
          kind: "poker_timeout_kick",
          refId: seat.id,
        },
      });
    }

    await tx.pokerSeat.delete({
      where: { id: seat.id },
    });
  }

  const remainingSeats = await tx.pokerSeat.findMany({
    where: { tableId },
  });
  const seatStacks = seatStacksFromSeats(remainingSeats);
  let nextState = normalizeSeats(state, seatStacks);
  if (
    nextState.phase !== "waiting" &&
    !nextState.seats.find((seat) => seat.seatIndex === nextState.turnIndex && seat.status === "active")
  ) {
    nextState = { ...nextState, turnIndex: -1 };
  }
  return { seats: remainingSeats, state: nextState, didRemove: true };
}

function resetSeatsForNewHand(state: PokerState, seatStacks: SeatStack[]) {
  const stackMap = new Map(seatStacks.map((seat) => [seat.seatIndex, seat.stackCents]));
  return {
    ...state,
    seats: state.seats.map((seat) => {
      const stack = stackMap.get(seat.seatIndex) ?? 0;
      const nextStatus: PokerSeatStatus = stack >= state.bigBlindCents ? "active" : "out";
      return {
        ...seat,
        status: nextStatus,
        hand: [],
        betCents: 0,
        hasActed: false,
        lastAction: null,
      };
    }),
  };
}

async function applyStackUpdates(
  tx: Prisma.TransactionClient,
  tableId: string,
  updates: Array<{ seatIndex: number; stackCents: number }>
) {
  if (updates.length === 0) return;
  await Promise.all(
    updates.map((update) =>
      tx.pokerSeat.updateMany({
        where: { tableId, seatIndex: update.seatIndex },
        data: { stackCents: update.stackCents },
      })
    )
  );
}

async function recordRound(
  tx: Prisma.TransactionClient,
  table: { id: string; buyInCents: number },
  state: PokerState,
  winners: string[],
  results: Array<{
    seatIndex: number;
    userId: string;
    result: "win" | "loss" | "tie";
    hand: { cards: any; bestLabel?: string; bestRanks?: string };
  }>
) {
  const round = await tx.pokerRound.create({
    data: {
      buyInCents: table.buyInCents,
      potCents: state.potCents,
      communityCards: state.community,
      winnerUserIds: winners,
    },
  });

  await Promise.all(
    results.map((player) =>
      tx.pokerRoundPlayer.create({
        data: {
          roundId: round.id,
          userId: player.userId,
          hand: player.hand,
          result: player.result,
        },
      })
    )
  );

  return round;
}

export async function progressTableState(
  tx: Prisma.TransactionClient,
  table: { id: string; buyInCents: number; state: any },
  seats: PokerSeat[],
  now: number
) {
  const baseState = table.state as PokerState | null;
  let state = baseState
    ? normalizeSeats(baseState, seatStacksFromSeats(seats))
    : createTableState(table.buyInCents);
  if (state.lastRound === undefined) {
    state = { ...state, lastRound: null };
  }
  if (state.handStartStacks === undefined) {
    state = { ...state, handStartStacks: null };
  }

  let seatStacks = seatStacksFromSeats(seats);
  state = applyTimeout(state, seatStacks, now);

  const removal = await removeTimedOutSeats(tx, table.id, seats, state);
  if (removal.didRemove) {
    seats = removal.seats;
    state = removal.state;
    seatStacks = seatStacksFromSeats(seats);
  }

  const finalizeShowdown = async (currentState: PokerState) => {
    const resultHoldUntil = now + 25_000;
    const { winners, stackUpdates, results } = resolveShowdown(currentState, seatStacks);
    await applyStackUpdates(tx, table.id, stackUpdates);
    stackUpdates.forEach((update) => {
      const seat = seatStacks.find((s) => s.seatIndex === update.seatIndex);
      if (seat) seat.stackCents = update.stackCents;
    });
    if (currentState.potCents > 0) {
      await recordRound(tx, table, currentState, winners, results);
    }
    state = resetSeatsForNewHand(
      { ...currentState, phase: "waiting", community: [], deck: [], potCents: 0 },
      seatStacks
    );
    const startStackMap = new Map(
      (currentState.handStartStacks ?? []).map((stack) => [stack.seatIndex, stack.stackCents])
    );
    const resultsWithNet = results.map((result) => {
      const startStack = startStackMap.get(result.seatIndex);
      const endStack = seatStacks.find((seat) => seat.seatIndex === result.seatIndex)?.stackCents;
      const netCents =
        startStack === undefined || endStack === undefined ? 0 : endStack - startStack;
      return { ...result, netCents };
    });

    state = {
      ...state,
      currentBet: 0,
      minRaise: state.bigBlindCents,
      turnIndex: -1,
      actionDeadline: 0,
      pendingStartAt: seatStacks.length >= 2 ? resultHoldUntil : 0,
      lastAggressorIndex: null,
      lastRound: {
        completedAt: now,
        expiresAt: resultHoldUntil,
        potCents: currentState.potCents,
        community: currentState.community,
        results: resultsWithNet,
      },
      handStartStacks: null,
    };
    return { state, didProgress: true };
  };

  const activeCount = remainingActiveCount(state);
  const inHandCount = state.seats.filter((seat) => seat.status === "active" || seat.status === "allin").length;
  if (state.phase !== "waiting" && (activeCount <= 1 || inHandCount <= 1 || state.phase === "showdown")) {
    if (state.phase !== "showdown") {
      while (state.phase !== "showdown") {
        state = advancePhase(state, now);
      }
    }
    return finalizeShowdown(state);
  }

  if (state.phase !== "waiting" && canCloseBetting(state)) {
    state = advancePhase(state, now);
    if (state.phase === "showdown") {
      return finalizeShowdown(state);
    }
    return { state, didProgress: true };
  }

  if (state.phase !== "waiting" && state.turnIndex === -1) {
    state = advanceTurn(state, now);
  }

  if (state.phase === "waiting") {
    let didUpdate = false;
    if (state.lastRound && now >= state.lastRound.expiresAt) {
      state = { ...state, lastRound: null };
      didUpdate = true;
    }
    if (state.lastRound && now < state.lastRound.expiresAt) {
      if (seatStacks.length >= 2 && !state.pendingStartAt) {
        state = { ...state, pendingStartAt: state.lastRound.expiresAt };
        return { state, didProgress: true };
      }
      return { state, didProgress: didUpdate };
    }
    if (seatStacks.length >= 2) {
      if (!state.pendingStartAt) {
        state = { ...state, pendingStartAt: now + 60_000 };
        return { state, didProgress: true };
      }
      if (now >= state.pendingStartAt) {
        const { state: started, stackUpdates } = startHand({ ...state, lastRound: null }, seatStacks, now);
        state = started;
        await applyStackUpdates(tx, table.id, stackUpdates);
        return { state, didProgress: true };
      }
    } else if (state.pendingStartAt) {
      state = { ...state, pendingStartAt: 0 };
      return { state, didProgress: true };
    }
    if (didUpdate) {
      return { state, didProgress: true };
    }
  }

  return { state, didProgress: false };
}
