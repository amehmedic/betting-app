import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { determineResult } from "@/lib/blackjack";
import { cloneStateFromRecord, serializeWallet } from "../helpers";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const game = await prisma.blackjackGame.findFirst({
    where: { userId: session.user.id },
    include: { wallet: true },
  });

  if (!game) {
    const wallet = await prisma.wallet.findFirst({
      where: { userId: session.user.id, currency: "USD" },
    });
    return NextResponse.json({
      ok: true,
      active: false,
      wallet: wallet ? serializeWallet(wallet) : null,
    });
  }

  const state = cloneStateFromRecord(game);
  const summary = determineResult(state.playerHand, state.dealerHand);

  return NextResponse.json({
    ok: true,
    active: true,
    state: game.status,
    gameId: game.id,
    bet: Number(game.bet) / 100,
    dealerRevealed: game.status !== "player",
    playerHand: state.playerHand,
    dealerHand: state.dealerHand,
    playerActions: state.playerActions,
    dealerActions: state.dealerActions,
    playerTotal: summary.playerTotal,
    dealerTotal: summary.dealerTotal,
    playerBust: summary.playerBust,
    dealerBust: summary.dealerBust,
    playerBlackjack: summary.playerBlackjack,
    dealerBlackjack: summary.dealerBlackjack,
    wallet: serializeWallet(game.wallet),
  });
}
