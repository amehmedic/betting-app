import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { z } from "zod";
import { playerHit, dealerPlay, determineRoundResult, evaluateHand } from "@/lib/blackjack";
import {
  cloneStateFromRecord,
  resolveBlackjackGame,
  serializeStateForUpdate,
  serializeWallet,
  summarizeState,
} from "../helpers";

const doubleSchema = z.object({
  gameId: z.string().min(1),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = doubleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { gameId } = parsed.data;

  const nextIncompleteHand = (hands: any[], actions: any[], startAt = 0) => {
    const len = hands.length;
    for (let offset = 0; offset < len; offset += 1) {
      const idx = (startAt + offset) % len;
      const hand = hands[idx];
      const acts = actions[idx] ?? [];
      const evalHand = evaluateHand(hand);
      const complete = evalHand.bust || acts.includes("stand") || acts.includes("double");
      if (!complete) return idx;
    }
    return -1;
  };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const game = await tx.blackjackGame.findUnique({
        where: { id: gameId },
      });

      if (!game) {
        return {
          type: "error" as const,
          response: NextResponse.json({ error: "Game not found" }, { status: 404 }),
        };
      }
      if (game.userId !== session.user.id) {
        return {
          type: "error" as const,
          response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        };
      }
      if (game.status !== "player") {
        return {
          type: "error" as const,
          response: NextResponse.json(
            { error: "Game is not awaiting player action" },
            { status: 409 }
          ),
        };
      }

      const wallet = await tx.wallet.findUnique({
        where: { id: game.walletId },
      });
      if (!wallet) {
        return {
          type: "error" as const,
          response: NextResponse.json({ error: "Wallet not found" }, { status: 404 }),
        };
      }

      const state = cloneStateFromRecord(game);
      const handIndex = state.activeHand;
      const hand = state.playerHands[handIndex];
      const handActions = state.playerActions[handIndex] ?? [];
      if (
        hand.length !== 2 ||
        handActions.includes("hit") ||
        handActions.includes("double")
      ) {
        return {
          type: "error" as const,
          response: NextResponse.json(
            { error: "Double down is only available on the initial hand" },
            { status: 400 }
          ),
        };
      }

      const additionalBet = BigInt(Math.round(state.handBets[handIndex] ?? Number(game.bet)));
      if (wallet.balance < additionalBet) {
        return {
          type: "error" as const,
          response: NextResponse.json({ error: "Insufficient balance to double down" }, { status: 400 }),
        };
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { decrement: additionalBet },
          held: { increment: additionalBet },
        },
      });

      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          amount: -additionalBet,
          kind: "blackjack_bet",
          refId: game.id,
        },
      });

      const hit = playerHit(state);
      let nextState = hit.state;
      const actions = nextState.playerActions[handIndex] ?? [];
      if (actions.length > 0) {
        actions[actions.length - 1] = "double";
      } else {
        actions.push("double");
      }
      if (!actions.includes("stand")) {
        actions.push("stand");
      }
      nextState.playerActions[handIndex] = actions;

      const remainingIndex = nextIncompleteHand(nextState.playerHands, nextState.playerActions, handIndex + 1);
      if (remainingIndex !== -1) {
        nextState.activeHand = remainingIndex;
      }

      // update bets
      const updatedHandBets = nextState.handBets.slice();
      updatedHandBets[handIndex] = (updatedHandBets[handIndex] ?? 0) * 2;
      nextState.handBets = updatedHandBets;

      if (remainingIndex === -1) {
        const dealerTurn = dealerPlay(nextState);
        nextState = dealerTurn.state;
      }

      const resolution = remainingIndex === -1
        ? determineRoundResult(nextState.playerHands, nextState.dealerHand, nextState.handBets)
        : null;
      const updatedGame = await tx.blackjackGame.update({
        where: { id: game.id },
        data: {
          bet: game.bet + additionalBet,
          ...serializeStateForUpdate(nextState),
          status: resolution ? "finished" : "player",
        },
      });

      let finalWallet = null;
      if (resolution) {
        finalWallet = await resolveBlackjackGame(tx, updatedGame, resolution, nextState.handBets);
      }

      return resolution
        ? {
            type: "finished" as const,
            bet: Number(updatedGame.bet) / 100,
            state: nextState,
            resolution,
            wallet: finalWallet!,
          }
        : {
            type: "player" as const,
            bet: Number(updatedGame.bet) / 100,
            state: nextState,
            gameId: updatedGame.id,
          };
    });

    if (result.type === "error") {
      return result.response;
    }

    if (result.type === "finished") {
      const summary = summarizeState(result.state, true);
      return NextResponse.json({
        ok: true,
        state: "finished",
        dealerRevealed: true,
        bet: result.bet,
        handBets: result.state.handBets.map((b) => b / 100),
        playerHands: result.state.playerHands,
        dealerHand: result.state.dealerHand,
        playerActions: result.state.playerActions,
        dealerActions: result.state.dealerActions,
        playerTotals: summary.playerTotals,
        dealerTotal: summary.dealerTotal,
        playerBusts: summary.playerBusts,
        dealerBust: summary.dealerBust,
        playerBlackjacks: summary.playerBlackjacks,
        dealerBlackjack: summary.dealerBlackjack,
        handResults: summary.handResults?.map((r) => r.result),
        result: summary.overallResult,
        wallet: serializeWallet(result.wallet),
      });
    }

    const summary = summarizeState(result.state, false);
    return NextResponse.json({
      ok: true,
      state: "player",
      dealerRevealed: false,
      bet: result.bet,
      gameId: result.gameId,
      handBets: result.state.handBets.map((b) => b / 100),
      playerHands: result.state.playerHands,
      dealerHand: result.state.dealerHand,
      playerActions: result.state.playerActions,
      dealerActions: result.state.dealerActions,
      activeHand: result.state.activeHand,
      playerTotals: summary.playerTotals,
      dealerTotal: summary.dealerTotal,
      playerBusts: summary.playerBusts,
      dealerBust: summary.dealerBust,
      playerBlackjacks: summary.playerBlackjacks,
      dealerBlackjack: summary.dealerBlackjack,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to double down" },
      { status: 500 }
    );
  }
}
