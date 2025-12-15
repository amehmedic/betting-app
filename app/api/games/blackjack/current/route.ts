import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { cloneStateFromRecord, serializeWallet, summarizeState } from "../helpers";

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
  const dealerRevealed = game.status !== "player";
  const summary = summarizeState(state, dealerRevealed);

  return NextResponse.json({
    ok: true,
    active: true,
    state: game.status,
    gameId: game.id,
    bet: Number(game.bet) / 100,
    handBets: state.handBets.map((b) => b / 100),
    dealerRevealed,
    playerHands: state.playerHands,
    dealerHand: state.dealerHand,
    playerActions: state.playerActions,
    dealerActions: state.dealerActions,
    activeHand: state.activeHand,
    playerTotals: summary.playerTotals,
    dealerTotal: summary.dealerTotal,
    playerBusts: summary.playerBusts,
    dealerBust: summary.dealerBust,
    playerBlackjacks: summary.playerBlackjacks,
    dealerBlackjack: summary.dealerBlackjack,
    handResults: summary.handResults?.map((r) => r.result),
    result: summary.overallResult,
    wallet: serializeWallet(game.wallet),
  });
}
