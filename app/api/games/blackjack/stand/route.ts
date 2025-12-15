import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { z } from "zod";
import { dealerPlay, determineRoundResult, evaluateHand } from "@/lib/blackjack";
import {
  cloneStateFromRecord,
  resolveBlackjackGame,
  serializeStateForUpdate,
  serializeWallet,
  summarizeState,
} from "../helpers";

const standSchema = z.object({
  gameId: z.string().min(1),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = standSchema.safeParse(body);
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
        return { type: "error" as const, response: NextResponse.json({ error: "Game not found" }, { status: 404 }) };
      }
      if (game.userId !== session.user.id) {
        return { type: "error" as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
      }
      if (game.status !== "player") {
        return {
          type: "error" as const,
          response: NextResponse.json(
            { error: "Game already resolved" },
            { status: 409 }
          ),
        };
      }

      const state = cloneStateFromRecord(game);
      if (!state.playerActions[state.activeHand]?.includes("stand")) {
        state.playerActions[state.activeHand]?.push("stand");
      }

      let nextState = state;
      let status: "player" | "finished" = "player";
      const nextActiveIndex = nextIncompleteHand(
        nextState.playerHands,
        nextState.playerActions,
        nextState.activeHand + 1
      );
      if (nextActiveIndex !== -1) {
        nextState.activeHand = nextActiveIndex;
      } else {
        const dealerTurn = dealerPlay(state);
        nextState = dealerTurn.state;
        status = "finished";
      }

      const updatedGame = await tx.blackjackGame.update({
        where: { id: game.id },
        data: {
          ...serializeStateForUpdate(nextState),
          status,
        },
      });

      if (status === "finished") {
        const resolution = determineRoundResult(nextState.playerHands, nextState.dealerHand, nextState.handBets);
        const wallet = await resolveBlackjackGame(
          tx,
          updatedGame,
          resolution,
          nextState.handBets
        );

        return {
          type: "finished" as const,
          bet: Number(updatedGame.bet) / 100,
          state: nextState,
          resolution,
          wallet,
        };
      }

      return {
        type: "player" as const,
        state: nextState,
        bet: Number(updatedGame.bet) / 100,
        gameId: game.id,
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
  } catch (err: unknown) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to resolve blackjack game" },
      { status: 500 }
    );
  }
}
