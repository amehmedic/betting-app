import type { Prisma, BlackjackGame, Wallet } from "@prisma/client";
import type {
  BlackjackState,
  BlackjackResolution,
  BlackjackAction,
  DealerAction,
  Card,
} from "@/lib/blackjack";

type StoredState = BlackjackState;

export function cloneStateFromRecord(game: BlackjackGame): StoredState {
  return {
    deck: clone<Card[]>(game.deck),
    playerHand: clone<Card[]>(game.playerHand),
    dealerHand: clone<Card[]>(game.dealerHand),
    playerActions: clone<BlackjackAction[]>(game.playerActions),
    dealerActions: clone<DealerAction[]>(game.dealerActions),
  };
}

export function serializeStateForUpdate(state: BlackjackState) {
  return {
    deck: state.deck,
    playerHand: state.playerHand,
    dealerHand: state.dealerHand,
    playerActions: state.playerActions,
    dealerActions: state.dealerActions,
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
  resolution: BlackjackResolution
) {
  const bet = game.bet;
  const walletUpdate: Prisma.WalletUpdateInput = {
    held: { decrement: bet },
  };

  if (resolution.result === "push") {
    walletUpdate.balance = { increment: bet };
  } else if (resolution.result === "win") {
    const payout = bet * BigInt(2);
    walletUpdate.balance = { increment: payout };
  }

  const wallet = await tx.wallet.update({
    where: { id: game.walletId },
    data: walletUpdate,
  });

  await tx.ledgerEntry.updateMany({
    where: { walletId: game.walletId, kind: "blackjack_bet", refId: game.id },
    data: { refId: `${game.id}:${resolution.result}` },
  });

  if (resolution.result === "push") {
    await tx.ledgerEntry.create({
      data: {
        walletId: game.walletId,
        amount: bet,
        kind: "blackjack_push",
        refId: `${game.id}:push`,
      },
    });
  } else if (resolution.result === "win") {
    const payout = bet * BigInt(2);
    await tx.ledgerEntry.create({
      data: {
        walletId: game.walletId,
        amount: payout,
        kind: resolution.playerBlackjack ? "blackjack_blackjack" : "blackjack_win",
        refId: `${game.id}:win`,
      },
    });
  }

  await tx.blackjackGame.delete({ where: { id: game.id } });

  return wallet;
}

function clone<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
