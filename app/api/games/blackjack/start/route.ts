import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { z } from "zod";
import {
  createInitialState,
  evaluateHand,
  determineResult,
} from "@/lib/blackjack";
import {
  resolveBlackjackGame,
  serializeStateForUpdate,
  serializeWallet,
} from "../helpers";

const startSchema = z.object({
  amount: z.number().positive().max(1_000_000),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { amount } = parsed.data;
  const bet = BigInt(Math.round(amount * 100));

  const existing = await prisma.blackjackGame.findFirst({
    where: { userId: session.user.id },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Finish your active blackjack game first" },
      { status: 409 }
    );
  }

  const wallet =
    (await prisma.wallet.findFirst({
      where: { userId: session.user.id, currency: "USD" },
    })) ??
    (await prisma.wallet.create({
      data: { userId: session.user.id, currency: "USD" },
    }));
  if (wallet.balance < bet) {
    return NextResponse.json(
      { error: "Insufficient balance" },
      { status: 400 }
    );
  }

  const state = createInitialState();
  const playerEval = evaluateHand(state.playerHand);
  const dealerEval = evaluateHand(state.dealerHand);
  const autoResolve = playerEval.blackjack || dealerEval.blackjack;

  if (autoResolve) {
    if (playerEval.blackjack && !state.playerActions.includes("stand")) {
      state.playerActions.push("stand");
    }
    if (!state.dealerActions.includes("stand")) {
      state.dealerActions.push("stand");
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const heldWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { decrement: bet },
          held: { increment: bet },
        },
      });

      const game = await tx.blackjackGame.create({
        data: {
          userId: session.user.id,
          walletId: wallet.id,
          bet,
          ...serializeStateForUpdate(state),
          status: autoResolve ? "finished" : "player",
        },
      });

      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          amount: -bet,
          kind: "blackjack_bet",
          refId: game.id,
        },
      });

      if (autoResolve) {
        const resolution = determineResult(
          state.playerHand,
          state.dealerHand
        );
        const finalWallet = await resolveBlackjackGame(tx, game, resolution);
        return {
          type: "finished" as const,
          wallet: finalWallet,
          resolution,
          state,
        };
      }

      return {
        type: "player" as const,
        game,
        wallet: heldWallet,
        state,
      };
    });

    if (result.type === "finished") {
      return NextResponse.json({
        ok: true,
        state: "finished",
        dealerRevealed: true,
        bet: Number(bet) / 100,
        playerHand: result.state.playerHand,
        dealerHand: result.state.dealerHand,
        playerTotal: result.resolution.playerTotal,
        dealerTotal: result.resolution.dealerTotal,
        playerBust: result.resolution.playerBust,
        dealerBust: result.resolution.dealerBust,
        playerBlackjack: result.resolution.playerBlackjack,
        dealerBlackjack: result.resolution.dealerBlackjack,
        playerActions: result.state.playerActions,
        dealerActions: result.state.dealerActions,
        result: result.resolution.result,
        wallet: serializeWallet(result.wallet),
      });
    }

    const currentEval = determineResult(
      result.state.playerHand,
      result.state.dealerHand
    );

    return NextResponse.json({
      ok: true,
      state: "player",
      dealerRevealed: false,
      gameId: result.game.id,
      bet: Number(bet) / 100,
      playerHand: result.state.playerHand,
      dealerHand: result.state.dealerHand,
      playerTotal: currentEval.playerTotal,
      dealerTotal: currentEval.dealerTotal,
      playerBust: currentEval.playerBust,
      dealerBust: currentEval.dealerBust,
      playerBlackjack: currentEval.playerBlackjack,
      dealerBlackjack: currentEval.dealerBlackjack,
      playerActions: result.state.playerActions,
      dealerActions: result.state.dealerActions,
      wallet: serializeWallet(result.wallet),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to start blackjack game" },
      { status: 500 }
    );
  }
}
