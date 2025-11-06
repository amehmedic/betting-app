export const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];

export type Card = {
  rank: Rank;
  suit: Suit;
};

export type BlackjackAction = "hit" | "stand";
export type DealerAction = "draw" | "stand";
export type BlackjackResult = "win" | "loss" | "push";

export type BlackjackState = {
  deck: Card[];
  playerHand: Card[];
  dealerHand: Card[];
  playerActions: BlackjackAction[];
  dealerActions: DealerAction[];
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

export function createInitialState(): BlackjackState {
  const deck = shuffle(buildDeck());
  const playerHand = [drawCard(deck), drawCard(deck)];
  const dealerHand = [drawCard(deck), drawCard(deck)];

  return {
    deck,
    playerHand,
    dealerHand,
    playerActions: [],
    dealerActions: [],
  };
}

export function playerHit(state: BlackjackState) {
  const deck = state.deck.slice();
  const playerHand = state.playerHand.slice();
  const playerActions = state.playerActions.slice();

  const card = drawCard(deck);
  playerHand.push(card);
  playerActions.push("hit");

  const evaluation = evaluateHand(playerHand);

  return {
    state: {
      ...state,
      deck,
      playerHand,
      playerActions,
    },
    card,
    evaluation,
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

export function simulateBlackjack(actions: BlackjackAction[] = []) {
  let state = createInitialState();
  let playerEval = evaluateHand(state.playerHand);

  if (playerEval.blackjack) {
    state.playerActions.push("stand");
  } else if (actions.length > 0) {
    for (const action of actions) {
      if (action === "hit") {
        const hit = playerHit(state);
        state = hit.state;
        playerEval = hit.evaluation;
        if (playerEval.bust) break;
      } else if (action === "stand") {
        state.playerActions.push("stand");
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
    if (!playerEval.bust) state.playerActions.push("stand");
  }

  if (!state.playerActions.includes("stand") && !playerEval.bust) {
    state.playerActions.push("stand");
  }

  if (!playerEval.bust) {
    const dealerTurn = dealerPlay(state);
    state = dealerTurn.state;
  }

  const resolution = determineResult(state.playerHand, state.dealerHand);

  return {
    playerHand: state.playerHand,
    dealerHand: state.dealerHand,
    playerActions: state.playerActions,
    dealerActions: state.dealerActions,
    playerTotal: resolution.playerTotal,
    dealerTotal: resolution.dealerTotal,
    playerBust: resolution.playerBust,
    dealerBust: resolution.dealerBust,
    playerBlackjack: resolution.playerBlackjack,
    dealerBlackjack: resolution.dealerBlackjack,
    result: resolution.result,
  };
}
