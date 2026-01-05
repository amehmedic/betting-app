import type { Card } from "@/lib/blackjack";
import { buildDeck, shuffle, drawCard } from "@/lib/blackjack";
import { bestHandFromSeven, compareScores, formatRanks } from "@/lib/poker";

export const MAX_SEATS = 6;
export const TURN_TIMEOUT_MS = 25_000;

export type PokerSeatStatus = "active" | "folded" | "out" | "allin";

export type PokerSeatState = {
  seatIndex: number;
  userId: string;
  hand: Card[];
  betCents: number;
  status: PokerSeatStatus;
  hasActed: boolean;
  lastAction: string | null;
  timeoutCount: number;
};

export type PokerState = {
  phase: "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown";
  dealerIndex: number;
  deck: Card[];
  community: Card[];
  potCents: number;
  currentBet: number;
  minRaise: number;
  turnIndex: number;
  actionDeadline: number;
  pendingStartAt: number;
  lastAggressorIndex: number | null;
  smallBlindCents: number;
  bigBlindCents: number;
  seats: PokerSeatState[];
  lastRound: PokerRoundSummary | null;
  handStartStacks: Array<{ seatIndex: number; stackCents: number }> | null;
};

export type PokerRoundSummary = {
  completedAt: number;
  expiresAt: number;
  potCents: number;
  community: Card[];
  results: Array<{
    seatIndex: number;
    userId: string;
    result: "win" | "loss" | "tie";
    hand: { cards: Card[]; bestLabel?: string; bestRanks?: string };
    netCents?: number;
  }>;
};

export type SeatStack = {
  seatIndex: number;
  userId: string;
  stackCents: number;
};

export function blindsForBuyIn(buyInCents: number) {
  const bigBlind = Math.max(2, Math.round(buyInCents / 50));
  const smallBlind = Math.max(1, Math.floor(bigBlind / 2));
  return { smallBlindCents: smallBlind, bigBlindCents: bigBlind };
}

export function createTableState(buyInCents: number): PokerState {
  const { smallBlindCents, bigBlindCents } = blindsForBuyIn(buyInCents);
  return {
    phase: "waiting",
    dealerIndex: 0,
    deck: [],
    community: [],
    potCents: 0,
    currentBet: 0,
    minRaise: bigBlindCents,
    turnIndex: 0,
    actionDeadline: 0,
    pendingStartAt: 0,
    lastAggressorIndex: null,
    smallBlindCents,
    bigBlindCents,
    seats: [],
    lastRound: null,
    handStartStacks: null,
  };
}

export function normalizeSeats(state: PokerState, seatStacks: SeatStack[]) {
  const seatIndices = new Set(seatStacks.map((seat) => seat.seatIndex));
  const nextSeats = state.seats
    .filter((seat) => seatIndices.has(seat.seatIndex))
    .map((seat) => {
      const match = seatStacks.find((s) => s.seatIndex === seat.seatIndex);
      if (!match) {
        return {
          ...seat,
          lastAction: seat.lastAction ?? null,
          timeoutCount: Number.isFinite(seat.timeoutCount) ? seat.timeoutCount : 0,
        };
      }
      return {
        ...seat,
        userId: match.userId,
        lastAction: seat.lastAction ?? null,
        timeoutCount: Number.isFinite(seat.timeoutCount) ? seat.timeoutCount : 0,
      };
    });
  for (const seat of seatStacks) {
    if (!nextSeats.find((s) => s.seatIndex === seat.seatIndex)) {
      nextSeats.push({
        seatIndex: seat.seatIndex,
        userId: seat.userId,
        hand: [],
        betCents: 0,
        status: "active",
        hasActed: false,
        lastAction: null,
        timeoutCount: 0,
      });
    }
  }
  return { ...state, seats: nextSeats };
}

function activeSeatStates(state: PokerState) {
  return state.seats.filter((seat) => seat.status === "active");
}

function inHandSeatStates(state: PokerState) {
  return state.seats.filter((seat) => seat.status === "active" || seat.status === "allin");
}

function nextSeatIndex(state: PokerState, fromIndex: number, includeAllIn = false) {
  const candidates = includeAllIn ? inHandSeatStates(state) : activeSeatStates(state);
  if (candidates.length === 0) return -1;
  const sorted = candidates.map((s) => s.seatIndex).sort((a, b) => a - b);
  for (const idx of sorted) {
    if (idx > fromIndex) return idx;
  }
  return sorted[0];
}

function seatStateByIndex(state: PokerState, seatIndex: number) {
  return state.seats.find((seat) => seat.seatIndex === seatIndex) ?? null;
}

export function startHand(state: PokerState, seatStacks: SeatStack[], now: number) {
  const seatMap = new Map(seatStacks.map((seat) => [seat.seatIndex, seat]));
  const eligible = state.seats.filter((seat) => {
    const stack = seatMap.get(seat.seatIndex)?.stackCents ?? 0;
    return seat.status !== "out" && stack >= state.bigBlindCents;
  });

  if (eligible.length < 2) {
    const nextSeats = state.seats.map((seat) => {
      const stack = seatMap.get(seat.seatIndex)?.stackCents ?? 0;
      if (stack < state.bigBlindCents) {
        return { ...seat, status: "out" as const };
      }
      return seat;
    });
    return { state: { ...state, phase: "waiting", seats: nextSeats }, stackUpdates: [] };
  }

  const dealerIndex = nextSeatIndex(
    { ...state, seats: eligible },
    state.dealerIndex ?? -1,
    true
  );
  const smallBlindIndex = nextSeatIndex({ ...state, seats: eligible }, dealerIndex, true);
  const bigBlindIndex = nextSeatIndex({ ...state, seats: eligible }, smallBlindIndex, true);

  const deck = shuffle(buildDeck());
  const newSeats = state.seats.map((seat) => {
    if (!eligible.find((s) => s.seatIndex === seat.seatIndex)) {
      return { ...seat, hand: [], betCents: 0, hasActed: false, lastAction: null };
    }
    return {
      ...seat,
      status: "active" as const,
      hand: [drawCard(deck), drawCard(deck)],
      betCents: 0,
      hasActed: false,
      lastAction: null,
    };
  });

  const stackUpdates: Array<{ seatIndex: number; stackCents: number }> = [];
  const postBlind = (seatIndex: number, amount: number) => {
    const seat = seatStateByIndex({ ...state, seats: newSeats }, seatIndex);
    const stack = seatMap.get(seatIndex)?.stackCents ?? 0;
    if (!seat) return;
    const blind = Math.min(stack, amount);
    stackUpdates.push({ seatIndex, stackCents: stack - blind });
    seat.betCents += blind;
    if (stack - blind <= 0) {
      seat.status = "allin";
    }
  };

  postBlind(smallBlindIndex, state.smallBlindCents);
  postBlind(bigBlindIndex, state.bigBlindCents);

  const potCents = newSeats.reduce((sum, seat) => sum + seat.betCents, 0);
  const turnIndex = nextSeatIndex({ ...state, seats: newSeats }, bigBlindIndex, false);

  return {
    state: {
      ...state,
      phase: "preflop",
      dealerIndex,
      deck,
      community: [],
      potCents,
      currentBet: state.bigBlindCents,
      minRaise: state.bigBlindCents,
      turnIndex,
      actionDeadline: now + TURN_TIMEOUT_MS,
      pendingStartAt: 0,
      lastAggressorIndex: bigBlindIndex,
      lastRound: null,
      handStartStacks: seatStacks.map((seat) => ({
        seatIndex: seat.seatIndex,
        stackCents: seat.stackCents,
      })),
      seats: newSeats,
    },
    stackUpdates,
  };
}

function allBetsMatched(state: PokerState) {
  const active = activeSeatStates(state);
  if (active.length === 0) return true;
  return active.every((seat) => seat.betCents === state.currentBet && seat.hasActed);
}

export function advancePhase(state: PokerState, now: number) {
  const deck = state.deck.slice();
  const nextCommunity = state.community.slice();

  let phase = state.phase;
  if (phase === "preflop") {
    nextCommunity.push(drawCard(deck), drawCard(deck), drawCard(deck));
    phase = "flop";
  } else if (phase === "flop") {
    nextCommunity.push(drawCard(deck));
    phase = "turn";
  } else if (phase === "turn") {
    nextCommunity.push(drawCard(deck));
    phase = "river";
  } else if (phase === "river") {
    phase = "showdown";
  }

  const resetSeats = state.seats.map((seat) =>
    seat.status === "active" ? { ...seat, betCents: 0, hasActed: false, lastAction: null } : seat
  );
  const turnIndex = nextSeatIndex({ ...state, seats: resetSeats }, state.dealerIndex, false);

  return {
    ...state,
    phase,
    deck,
    community: nextCommunity,
    currentBet: 0,
    minRaise: state.bigBlindCents,
    turnIndex,
    actionDeadline: now + TURN_TIMEOUT_MS,
    lastAggressorIndex: null,
    seats: resetSeats,
  };
}

export function resolveShowdown(
  state: PokerState,
  seatStacks: SeatStack[]
) {
  const seatMap = new Map(seatStacks.map((seat) => [seat.seatIndex, seat]));
  const contenders = inHandSeatStates(state);
  if (contenders.length === 0) {
    return { winners: [], stackUpdates: [] as Array<{ seatIndex: number; stackCents: number }>, results: [] as any[] };
  }

  const scored = contenders.map((seat) => {
    const score = bestHandFromSeven([...seat.hand, ...state.community]);
    return { seat, score };
  });

  let bestScore = scored[0].score;
  let winners = [scored[0]];
  for (let i = 1; i < scored.length; i += 1) {
    const cmp = compareScores(scored[i].score, bestScore);
    if (cmp > 0) {
      bestScore = scored[i].score;
      winners = [scored[i]];
    } else if (cmp === 0) {
      winners.push(scored[i]);
    }
  }

  const share = Math.floor(state.potCents / winners.length);
  const remainder = state.potCents - share * winners.length;
  const stackUpdates = winners.map((winner, idx) => {
    const stack = seatMap.get(winner.seat.seatIndex)?.stackCents ?? 0;
    return {
      seatIndex: winner.seat.seatIndex,
      stackCents: stack + share + (idx === 0 ? remainder : 0),
    };
  });

  const resultBySeat = new Map<number, (typeof scored)[number]>();
  scored.forEach((player) => resultBySeat.set(player.seat.seatIndex, player));
  const results = state.seats
    .filter((seat) => seat.status !== "out" && seat.hand.length > 0)
    .map((seat) => {
      const scoredSeat = resultBySeat.get(seat.seatIndex);
      if (!scoredSeat) {
        return {
          seatIndex: seat.seatIndex,
          userId: seat.userId,
          result: "loss" as const,
          hand: {
            cards: seat.hand,
            bestLabel: "Folded",
          },
        };
      }
      return {
        seatIndex: scoredSeat.seat.seatIndex,
        userId: scoredSeat.seat.userId,
        result: winners.some((w) => w.seat.seatIndex === scoredSeat.seat.seatIndex)
          ? winners.length > 1
            ? "tie"
            : "win"
          : "loss",
        hand: {
          cards: scoredSeat.seat.hand,
          bestLabel: scoredSeat.score.label,
          bestRanks: formatRanks(scoredSeat.score.tiebreaker),
        },
      };
    });

  return {
    winners: winners.map((winner) => winner.seat.userId),
    stackUpdates,
    results,
  };
}

export function applyTimeout(state: PokerState, seatStacks: SeatStack[], now: number) {
  if (state.phase === "waiting" || state.actionDeadline === 0) return state;
  if (now < state.actionDeadline) return state;
  const seat = seatStateByIndex(state, state.turnIndex);
  if (!seat || seat.status !== "active") return state;
  if (state.currentBet === 0) {
    seat.hasActed = true;
    seat.lastAction = "Timed out";
    seat.timeoutCount = (seat.timeoutCount ?? 0) + 1;
    const next = nextSeatIndex(state, seat.seatIndex, false);
    return { ...state, turnIndex: next, actionDeadline: now + TURN_TIMEOUT_MS };
  }
  seat.status = "folded";
  seat.hasActed = true;
  seat.lastAction = "Timed out";
  seat.timeoutCount = (seat.timeoutCount ?? 0) + 1;
  const next = nextSeatIndex(state, seat.seatIndex, false);
  return { ...state, turnIndex: next, actionDeadline: now + TURN_TIMEOUT_MS };
}

export function canCloseBetting(state: PokerState) {
  const active = activeSeatStates(state);
  return active.length === 0 || allBetsMatched(state);
}

export function remainingActiveCount(state: PokerState) {
  return activeSeatStates(state).length;
}

export function setAllActiveHasActedFalse(state: PokerState, exceptSeatIndex: number) {
  return {
    ...state,
    seats: state.seats.map((seat) => {
      if (seat.status !== "active") return seat;
      return { ...seat, hasActed: seat.seatIndex === exceptSeatIndex };
    }),
  };
}

export function advanceTurn(state: PokerState, now: number) {
  const next = nextSeatIndex(state, state.turnIndex, false);
  return { ...state, turnIndex: next, actionDeadline: now + TURN_TIMEOUT_MS };
}
