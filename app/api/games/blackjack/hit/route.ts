import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { z } from "zod";
import { playerHit, determineResult } from "@/lib/blackjack";
import {
  cloneStateFromRecord,
  resolveBlackjackGame,
  serializeStateForUpdate,
  serializeWallet,
} from "../helpers";

const hitSchema = z.object({
  gameId: z.string().min(1),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = hitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { gameId } = parsed.data;

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
            { error: "Game is not awaiting player action" },
            { status: 409 }
          ),
        };
      }

      const state = cloneStateFromRecord(game);
      const hit = playerHit(state);
      const nextState = hit.state;

      const updatedGame = await tx.blackjackGame.update({
        where: { id: game.id },
        data: {
          ...serializeStateForUpdate(nextState),
          status: hit.evaluation.bust ? "finished" : "player",
        },
      });

      if (hit.evaluation.bust) {
        const resolution = determineResult(
          nextState.playerHand,
          nextState.dealerHand
        );
        const wallet = await resolveBlackjackGame(
          tx,
          updatedGame,
          resolution
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
        gameId: game.id,
        bet: Number(game.bet) / 100,
      };
    });

    if (result.type === "error") {
      return result.response;
    }

    if (result.type === "finished") {
      return NextResponse.json({
        ok: true,
        state: "finished",
        dealerRevealed: true,
        bet: result.bet,
        playerHand: result.state.playerHand,
        dealerHand: result.state.dealerHand,
        playerActions: result.state.playerActions,
        dealerActions: result.state.dealerActions,
        ...result.resolution,
        wallet: serializeWallet(result.wallet),
      });
    }

    const summary = determineResult(
      result.state.playerHand,
      result.state.dealerHand
    );

    return NextResponse.json({
      ok: true,
      state: "player",
      dealerRevealed: false,
      gameId: result.gameId,
      bet: result.bet,
      playerHand: result.state.playerHand,
      dealerHand: result.state.dealerHand,
      playerActions: result.state.playerActions,
      dealerActions: result.state.dealerActions,
      playerTotal: summary.playerTotal,
      dealerTotal: summary.dealerTotal,
      playerBust: summary.playerBust,
      dealerBust: summary.dealerBust,
      playerBlackjack: summary.playerBlackjack,
      dealerBlackjack: summary.dealerBlackjack,
    });
  } catch (err: unknown) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to draw a card" },
      { status: 500 }
    );
  }
}
