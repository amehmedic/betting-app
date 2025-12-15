export const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];

export type Card = {
  rank: Rank;
  suit: Suit;
};

export type BlackjackAction = "hit" | "stand" | "double" | "split";
export type DealerAction = "draw" | "stand";
export type BlackjackResult = "win" | "loss" | "push";

export type BlackjackState = {
  deck: Card[];
  playerHands: Card[][];
  playerActions: BlackjackAction[][];
  dealerHand: Card[];
  dealerActions: DealerAction[];
  handBets: number[]; // cents per hand
  activeHand: number;
};

export type BlackjackEvaluation = ReturnType<typeof evaluateHand>;

export type BlackjackResolution = {
  playerTotal: number;
  dealerTotal: number;
  playerBust: boolean;
  dealerBust: boolean;
  playerBlackjack: boolean;
  dealerBlackjack: boolean;
  result: BlackjackResult;
};

export type BlackjackRoundResolution = {
  perHand: BlackjackResolution[];
  overall: BlackjackResult;
};

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

export function shuffle(deck: Card[]): Card[] {
  const copy = deck.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function randomInt(max: number): number {
  if (max <= 0) throw new Error("max must be positive");
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const rand = buf[0] / 0x100000000;
  return Math.floor(rand * max);
}

export function drawCard(deck: Card[]): Card {
  const card = deck.pop();
  if (!card) {
    throw new Error("Deck exhausted");
  }
  return card;
}

function cardValue(rank: Rank): number {
  if (rank === "A") return 11;
  if (rank === "K" || rank === "Q" || rank === "J") return 10;
  return Number(rank);
}

export function evaluateHand(hand: Card[]) {
  let total = 0;
  let aceCount = 0;

  for (const card of hand) {
    total += cardValue(card.rank);
    if (card.rank === "A") aceCount += 1;
  }

  while (total > 21 && aceCount > 0) {
    total -= 10;
    aceCount -= 1;
  }

  return {
    total,
    soft: aceCount > 0,
    blackjack: hand.length === 2 && total === 21,
    bust: total > 21,
  };
}

function hasSameValueForSplit(cards: Card[]) {
  if (cards.length !== 2) return false;
  const a = cards[0];
  const b = cards[1];
  if (!a || !b) return false;
  return a.rank === b.rank;
}

export function createInitialState(handBetCents = 0): BlackjackState {
  const deck = shuffle(buildDeck());
  const playerHand = [drawCard(deck), drawCard(deck)];
  const dealerHand = [drawCard(deck), drawCard(deck)];

  return {
    deck,
    playerHands: [playerHand],
    playerActions: [[]],
    dealerHand,
    dealerActions: [],
    handBets: [handBetCents],
    activeHand: 0,
  };
}

function isHandComplete(hand: Card[], actions: BlackjackAction[]) {
  const evaluation = evaluateHand(hand);
  return evaluation.bust || actions.includes("stand") || actions.includes("double");
}

function nextActiveHandIndex(state: BlackjackState, fromIndex?: number) {
  const start = typeof fromIndex === "number" ? fromIndex + 1 : state.activeHand;
  for (let i = start; i < state.playerHands.length; i += 1) {
    if (!isHandComplete(state.playerHands[i], state.playerActions[i])) {
      return i;
    }
  }
  return -1;
}

export function playerHit(state: BlackjackState) {
  const deck = state.deck.slice();
  const playerHands = state.playerHands.map((hand) => hand.slice());
  const playerActions = state.playerActions.map((actions) => actions.slice());
  const handIndex = state.activeHand;
  const hand = playerHands[handIndex];

  const card = drawCard(deck);
  hand.push(card);
  playerActions[handIndex].push("hit");

  const evaluation = evaluateHand(hand);
  let activeHand = handIndex;
  if (evaluation.bust) {
    if (!playerActions[handIndex].includes("stand")) {
      playerActions[handIndex].push("stand");
    }
    const next = nextActiveHandIndex(
      {
        ...state,
        deck,
        playerHands,
        playerActions,
      },
      handIndex
    );
    activeHand = next === -1 ? handIndex : next;
  }

  return {
    state: {
      ...state,
      deck,
      playerHands,
      playerActions,
      activeHand,
    },
    card,
    evaluation,
    allHandsDone: nextActiveHandIndex({
      ...state,
      deck,
      playerHands,
      playerActions,
      activeHand,
    }) === -1 && isHandComplete(hand, playerActions[handIndex]),
  };
}

export function playerStand(state: BlackjackState) {
  const playerActions = state.playerActions.map((actions) => actions.slice());
  const handIndex = state.activeHand;
  if (!playerActions[handIndex].includes("stand")) {
    playerActions[handIndex].push("stand");
  }
  const next = nextActiveHandIndex(
    { ...state, playerActions },
    handIndex
  );
  const activeHand = next === -1 ? handIndex : next;
  return {
    state: {
      ...state,
      playerActions,
      activeHand,
    },
    allHandsDone: next === -1,
  };
}

export function splitHand(state: BlackjackState) {
  const handIndex = state.activeHand;
  const current = state.playerHands[handIndex];
  if (current.length !== 2 || !hasSameValueForSplit(current)) {
    throw new Error("Split not allowed for this hand");
  }
  if (state.playerHands.length >= 2) {
    throw new Error("Only one split supported");
  }
  const deck = state.deck.slice();
  const first = [current[0], drawCard(deck)];
  const second = [current[1], drawCard(deck)];
  const playerHands = state.playerHands.map((hand, idx) =>
    idx === handIndex ? first : hand.slice()
  );
  playerHands.splice(handIndex + 1, 0, second);

  const playerActions = state.playerActions.map((actions, idx) =>
    idx === handIndex ? ["split"] : actions.slice()
  );
  playerActions.splice(handIndex + 1, 0, ["split"]);

  const handBets = state.handBets.slice();
  handBets.splice(handIndex + 1, 0, handBets[handIndex]);

  return {
    state: {
      ...state,
      deck,
      playerHands,
      playerActions,
      handBets,
      activeHand: handIndex,
    },
  };
}

export function dealerPlay(state: BlackjackState) {
  const deck = state.deck.slice();
  const dealerHand = state.dealerHand.slice();
  const dealerActions = state.dealerActions.slice();

  let evaluation = evaluateHand(dealerHand);

  while (evaluation.total < 17 || (evaluation.total === 17 && evaluation.soft)) {
    const card = drawCard(deck);
    dealerHand.push(card);
    dealerActions.push("draw");
    evaluation = evaluateHand(dealerHand);
  }

  dealerActions.push("stand");

  return {
    state: {
      ...state,
      deck,
      dealerHand,
      dealerActions,
    },
    evaluation,
  };
}

export function determineResult(playerHand: Card[], dealerHand: Card[]): BlackjackResolution {
  const playerEval = evaluateHand(playerHand);
  const dealerEval = evaluateHand(dealerHand);

  let result: BlackjackResult = "push";

  if (playerEval.blackjack && !dealerEval.blackjack) {
    result = "win";
  } else if (dealerEval.blackjack && !playerEval.blackjack) {
    result = "loss";
  } else if (playerEval.bust) {
    result = "loss";
  } else if (dealerEval.bust) {
    result = "win";
  } else if (playerEval.total > dealerEval.total) {
    result = "win";
  } else if (playerEval.total < dealerEval.total) {
    result = "loss";
  }

  return {
    playerTotal: playerEval.total,
    dealerTotal: dealerEval.total,
    playerBust: playerEval.bust,
    dealerBust: dealerEval.bust,
    playerBlackjack: playerEval.blackjack,
    dealerBlackjack: dealerEval.blackjack,
    result,
  };
}

export function determineRoundResult(
  playerHands: Card[][],
  dealerHand: Card[],
  handBets: number[] = []
): BlackjackRoundResolution {
  const perHand = playerHands.map((hand) => determineResult(hand, dealerHand));
  const net = perHand.reduce((acc, res, idx) => {
    const weight = handBets[idx] ?? 1;
    if (res.result === "win") return acc + weight;
    if (res.result === "loss") return acc - weight;
    return acc;
  }, 0);

  const overall: BlackjackResult = net > 0 ? "win" : net < 0 ? "loss" : "push";

  return { perHand, overall };
}

export function simulateBlackjack(actions: BlackjackAction[] = []) {
  let state = createInitialState();
  let playerEval = evaluateHand(state.playerHands[0]);

  if (playerEval.blackjack) {
    state.playerActions[0].push("stand");
  } else if (actions.length > 0) {
    for (const action of actions) {
      if (action === "hit") {
        const hit = playerHit(state);
        state = hit.state;
        playerEval = hit.evaluation;
        if (playerEval.bust) break;
      } else if (action === "stand") {
        state.playerActions[state.activeHand].push("stand");
        break;
      }
    }
  } else {
    while (playerEval.total < 17) {
      const hit = playerHit(state);
      state = hit.state;
      playerEval = hit.evaluation;
      if (playerEval.bust) break;
    }
    if (!playerEval.bust) state.playerActions[state.activeHand].push("stand");
  }

  if (!isHandComplete(state.playerHands[state.activeHand], state.playerActions[state.activeHand])) {
    state.playerActions[state.activeHand].push("stand");
  }

  const dealerTurn = dealerPlay(state);
  state = dealerTurn.state;

  const resolution = determineRoundResult(state.playerHands, state.dealerHand);

  return {
    playerHands: state.playerHands,
    dealerHand: state.dealerHand,
    playerActions: state.playerActions,
    dealerActions: state.dealerActions,
    resolution,
  };
}
