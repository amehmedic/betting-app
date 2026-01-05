import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth";
import type { PokerState } from "@/lib/poker-engine";
import { progressTableState } from "@/app/api/games/poker/shared";
import { startPokerTicker } from "../../../../../lib/poker-ticker";

export const runtime = "nodejs";

const BUY_INS = [100, 1000, 10000] as const;

function serializeState(
  state: PokerState,
  currentUserId: string | null,
  seatUsernames: Map<number, string | null>,
  seatStacks: Map<number, number>,
  seatAvatars: Map<number, string | null>,
  now: number
) {
  const showAllHands =
    state.phase === "showdown" ||
    (state.lastRound ? now < state.lastRound.expiresAt : false);
  return {
    phase: state.phase,
    dealerIndex: state.dealerIndex,
    community: state.community,
    potCents: state.potCents,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    turnIndex: state.turnIndex,
    actionDeadline: state.actionDeadline,
    pendingStartAt: state.pendingStartAt,
    smallBlindCents: state.smallBlindCents,
    bigBlindCents: state.bigBlindCents,
    lastRound: state.lastRound,
    seats: state.seats.map((seat) => {
      const isYou = seat.userId === currentUserId;
      return {
        seatIndex: seat.seatIndex,
        userId: seat.userId,
        username: seatUsernames.get(seat.seatIndex) ?? null,
        avatarUrl: seatAvatars.get(seat.seatIndex) ?? null,
        stackCents: seatStacks.get(seat.seatIndex) ?? 0,
        status: seat.status,
        betCents: seat.betCents,
        hand: showAllHands || isYou ? seat.hand : [],
        hasActed: seat.hasActed,
        lastAction: seat.lastAction ?? null,
        isYou,
      };
    }),
  };
}

export async function GET() {
  startPokerTicker();
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const now = Date.now();

  const [seat, tables] = await Promise.all([
    prisma.pokerSeat.findFirst({
      where: { userId },
      include: {
        table: true,
      },
    }),
    prisma.pokerTable.findMany({
      where: { buyInCents: { in: BUY_INS.map((b) => b * 100) } },
      include: { seats: true },
    }),
  ]);

  const tierSummary = BUY_INS.map((buyIn) => {
    const table = tables.find((t) => t.buyInCents === buyIn * 100);
    return {
      buyIn,
      seated: table?.seats.length ?? 0,
    };
  });

  let tableState: PokerState | null = null;
  let tableId: string | null = null;
  let seatIndex: number | null = null;

  if (seat?.table) {
    tableId = seat.tableId;
    seatIndex = seat.seatIndex;
    const updated = await prisma.$transaction(async (tx) => {
      const table = await tx.pokerTable.findUnique({
        where: { id: seat.tableId },
      });
      if (!table) return null;
      const seats = await tx.pokerSeat.findMany({
        where: { tableId: seat.tableId },
        include: { user: true },
      });
      const { state } = await progressTableState(tx, table, seats, now);
      await tx.pokerTable.update({
        where: { id: table.id },
        data: { state },
      });
      const nameMap = new Map(seats.map((s) => [s.seatIndex, s.user.username ?? s.user.email ?? null]));
      const stackMap = new Map(seats.map((s) => [s.seatIndex, s.stackCents]));
      const avatarMap = new Map(seats.map((s) => [s.seatIndex, s.user.avatarUrl ?? null]));
      return { state, nameMap, stackMap, avatarMap };
    });

    if (updated) {
      tableState = updated.state;
      const serialized = serializeState(
        updated.state,
        userId,
        updated.nameMap,
        updated.stackMap,
        updated.avatarMap,
        now
      );
      tableState = serialized as any;
    }
  }

  return NextResponse.json({
    ok: true,
    userId,
    tiers: tierSummary,
    seated: seatIndex !== null ? { tableId, seatIndex, buyIn: seat?.table?.buyInCents ? seat.table.buyInCents / 100 : null } : null,
    table: tableState,
  });
}
