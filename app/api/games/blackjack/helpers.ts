import type { Prisma, BlackjackGame, Wallet } from "@prisma/client";
import {
  determineRoundResult,
  evaluateHand,
  type BlackjackState,
  type BlackjackRoundResolution,
  type BlackjackAction,
  type DealerAction,
  type Card,
  type BlackjackResult,
  type BlackjackResolution,
} from "@/lib/blackjack";

type StoredState = BlackjackState;

export function cloneStateFromRecord(game: BlackjackGame): StoredState {
  const playerHands: Card[][] =
    Array.isArray(game.playerHands) && Array.isArray((game.playerHands as unknown[])[0])
      ? clone<Card[][]>(game.playerHands)
      : [clone<Card[]>(game.playerHand)];
  const rawPlayerActions =
    Array.isArray(game.playerActions) && Array.isArray((game.playerActions as unknown[])[0])
      ? (game.playerActions as unknown as BlackjackAction[][])
      : [clone<BlackjackAction[]>(game.playerActions as unknown as BlackjackAction[])];
  const playerActions: BlackjackAction[][] = clone<BlackjackAction[][]>(rawPlayerActions);
  const handBets: number[] = Array.isArray(game.handBets)
    ? clone<number[]>(game.handBets)
    : [Number(game.bet)];

  return {
    deck: clone<Card[]>(game.deck),
    playerHands,
    dealerHand: clone<Card[]>(game.dealerHand),
    playerActions,
    dealerActions: clone<DealerAction[]>(game.dealerActions),
    handBets,
    activeHand: typeof game.activeHand === "number" ? game.activeHand : 0,
  };
}

export function serializeStateForUpdate(state: BlackjackState) {
  return {
    deck: state.deck,
    playerHand: state.playerHands[0] ?? [],
    playerHands: state.playerHands,
    dealerHand: state.dealerHand,
    playerActions: state.playerActions,
    dealerActions: state.dealerActions,
    handBets: state.handBets,
    activeHand: state.activeHand,
  };
}

export function serializeWallet(wallet: Wallet) {
  return {
    balance: wallet.balance.toString(),
    held: wallet.held.toString(),
  };
}

export async function resolveBlackjackGame(
  tx: Prisma.TransactionClient,
  game: BlackjackGame,
  resolution: BlackjackRoundResolution,
  handBets: number[]
) {
  const bets = handBets.map((b) => BigInt(Math.round(b)));
  const totalBet = bets.reduce((acc, b) => acc + b, 0n);

  let balanceIncrement = 0n;
  let winPayout = 0n;
  let pushReturn = 0n;

  resolution.perHand.forEach((res, idx) => {
    const stake = bets[idx] ?? 0n;
    if (res.result === "win") {
      const amount = stake * 2n;
      balanceIncrement += amount;
      winPayout += amount;
    } else if (res.result === "push") {
      balanceIncrement += stake;
      pushReturn += stake;
    }
  });

  const walletUpdate: Prisma.WalletUpdateInput = {
    held: { decrement: totalBet },
    balance: { increment: balanceIncrement },
  };

  const wallet = await tx.wallet.update({
    where: { id: game.walletId },
    data: walletUpdate,
  });

  await tx.ledgerEntry.updateMany({
    where: { walletId: game.walletId, kind: "blackjack_bet", refId: game.id },
    data: { refId: `${game.id}:${resolution.overall}` },
  });

  if (pushReturn > 0n) {
    await tx.ledgerEntry.create({
      data: {
        walletId: game.walletId,
        amount: pushReturn,
        kind: "blackjack_push",
        refId: `${game.id}:push`,
      },
    });
  }

  if (winPayout > 0n) {
    await tx.ledgerEntry.create({
      data: {
        walletId: game.walletId,
        amount: winPayout,
        kind: "blackjack_win",
        refId: `${game.id}:win`,
      },
    });
  }

  await tx.blackjackGame.delete({ where: { id: game.id } });

  return wallet;
}

export function summarizeState(
  state: BlackjackState,
  dealerRevealed: boolean
): {
  playerTotals: number[];
  playerBusts: boolean[];
  playerBlackjacks: boolean[];
  dealerTotal: number;
  dealerBust: boolean;
  dealerBlackjack: boolean;
  handResults?: BlackjackResolution[];
  overallResult?: BlackjackResult;
} {
  const playerEvals = state.playerHands.map((hand) => evaluateHand(hand));
  const dealerEval = evaluateHand(state.dealerHand);
  const dealerTotal = dealerRevealed ? dealerEval.total : dealerEval.total;

  let handResults: BlackjackResolution[] | undefined;
  let overallResult: BlackjackResult | undefined;
  if (dealerRevealed) {
    const round = determineRoundResult(state.playerHands, state.dealerHand, state.handBets);
    handResults = round.perHand;
    overallResult = round.overall;
  }

  return {
    playerTotals: playerEvals.map((e) => e.total),
    playerBusts: playerEvals.map((e) => e.bust),
    playerBlackjacks: playerEvals.map((e) => e.blackjack),
    dealerTotal,
    dealerBust: dealerEval.bust,
    dealerBlackjack: dealerEval.blackjack,
    handResults,
    overallResult,
  };
}

function clone<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
