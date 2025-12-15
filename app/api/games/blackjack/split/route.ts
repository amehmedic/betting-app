import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { z } from "zod";
import { splitHand, evaluateHand } from "@/lib/blackjack";
import {
  cloneStateFromRecord,
  serializeStateForUpdate,
  serializeWallet,
  summarizeState,
} from "../helpers";

const splitSchema = z.object({
  gameId: z.string().min(1),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = splitSchema.safeParse(body);
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

      const wallet = await tx.wallet.findUnique({ where: { id: game.walletId } });
      if (!wallet) {
        return { type: "error" as const, response: NextResponse.json({ error: "Wallet not found" }, { status: 404 }) };
      }

      const state = cloneStateFromRecord(game);
      const handIndex = state.activeHand;
      const hand = state.playerHands[handIndex];
      const actions = state.playerActions[handIndex] ?? [];

      const evalHand = evaluateHand(hand);
      if (
        hand.length !== 2 ||
        !evalHand ||
        !(hand[0] && hand[1]) ||
        hand[0].rank !== hand[1].rank
      ) {
        return {
          type: "error" as const,
          response: NextResponse.json({ error: "Split is only available on a true pair (same rank)" }, { status: 400 }),
        };
      }

      if (state.playerHands.length >= 2) {
        return {
          type: "error" as const,
          response: NextResponse.json({ error: "Only one split supported" }, { status: 400 }),
        };
      }

      if (actions.includes("double") || actions.includes("hit")) {
        return {
          type: "error" as const,
          response: NextResponse.json({ error: "Split must be the first decision" }, { status: 400 }),
        };
      }

      const additionalBet = BigInt(Math.round(state.handBets[handIndex] ?? Number(game.bet)));
      if (wallet.balance < additionalBet) {
        return {
          type: "error" as const,
          response: NextResponse.json({ error: "Insufficient balance to split" }, { status: 400 }),
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

      const split = splitHand(state);
      const nextState = split.state;

      const updatedGame = await tx.blackjackGame.update({
        where: { id: game.id },
        data: {
          bet: game.bet + additionalBet,
          ...serializeStateForUpdate(nextState),
          status: "player",
        },
      });

      return {
        type: "player" as const,
        state: nextState,
        bet: Number(updatedGame.bet) / 100,
        gameId: updatedGame.id,
        walletId: updatedGame.walletId,
      };
    });

    if (result.type === "error") {
      return result.response;
    }

    const summary = summarizeState(result.state, false);
    const wallet = await prisma.wallet.findUnique({ where: { id: result.walletId } });

    return NextResponse.json({
      ok: true,
      state: "player",
      dealerRevealed: false,
      gameId: result.gameId,
      bet: result.bet,
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
      wallet: wallet ? serializeWallet(wallet) : null,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to split hand" }, { status: 500 });
  }
}
