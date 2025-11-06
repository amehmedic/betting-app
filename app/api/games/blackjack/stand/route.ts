import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { z } from "zod";
import { dealerPlay, determineResult } from "@/lib/blackjack";
import {
  cloneStateFromRecord,
  resolveBlackjackGame,
  serializeStateForUpdate,
  serializeWallet,
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
      if (!state.playerActions.includes("stand")) {
        state.playerActions.push("stand");
      }

      const dealerTurn = dealerPlay(state);
      const nextState = dealerTurn.state;

      const updatedGame = await tx.blackjackGame.update({
        where: { id: game.id },
        data: {
          ...serializeStateForUpdate(nextState),
          status: "finished",
        },
      });

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
    });

    if (result.type === "error") {
      return result.response;
    }

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
  } catch (err: unknown) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to resolve blackjack game" },
      { status: 500 }
    );
  }
}
