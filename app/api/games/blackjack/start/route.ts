import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { z } from "zod";
import {
  createInitialState,
  evaluateHand,
  determineRoundResult,
} from "@/lib/blackjack";
import {
  resolveBlackjackGame,
  serializeStateForUpdate,
  serializeWallet,
  summarizeState,
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

  const state = createInitialState(Number(bet));
  const playerEval = evaluateHand(state.playerHands[0]);
  const dealerEval = evaluateHand(state.dealerHand);
  const autoResolve = playerEval.blackjack || dealerEval.blackjack;

  if (autoResolve) {
    if (playerEval.blackjack && !state.playerActions[0]?.includes("stand")) {
      state.playerActions[0]?.push("stand");
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
        const resolution = determineRoundResult(state.playerHands, state.dealerHand, state.handBets);
        const finalWallet = await resolveBlackjackGame(tx, game, resolution, state.handBets);
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
      const summary = summarizeState(result.state, true);
      return NextResponse.json({
        ok: true,
        state: "finished",
        dealerRevealed: true,
        bet: Number(bet) / 100,
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
      gameId: result.game.id,
      bet: Number(bet) / 100,
      handBets: result.state.handBets.map((b) => b / 100),
      playerHands: result.state.playerHands,
      dealerHand: result.state.dealerHand,
      activeHand: result.state.activeHand,
      playerTotals: summary.playerTotals,
      dealerTotal: summary.dealerTotal,
      playerBusts: summary.playerBusts,
      dealerBust: summary.dealerBust,
      playerBlackjacks: summary.playerBlackjacks,
      dealerBlackjack: summary.dealerBlackjack,
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
