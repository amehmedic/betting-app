import { prisma } from "@/lib/prisma";
import { progressTableState } from "@/app/api/games/poker/shared";

declare global {
  // eslint-disable-next-line no-var
  var pokerTicker: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var pokerTicking: boolean | undefined;
}

async function tickPokerTables() {
  if (globalThis.pokerTicking) return;
  globalThis.pokerTicking = true;
  try {
    const tables = await prisma.pokerTable.findMany({
      include: { seats: true },
    });
    const now = Date.now();
    for (const table of tables) {
      if (table.seats.length === 0) continue;
      await prisma.$transaction(async (tx) => {
        const freshTable = await tx.pokerTable.findUnique({
          where: { id: table.id },
        });
        if (!freshTable) return;
        const seats = await tx.pokerSeat.findMany({
          where: { tableId: table.id },
        });
        const result = await progressTableState(tx, freshTable, seats, now);
        if (result.didProgress) {
          await tx.pokerTable.update({
            where: { id: table.id },
            data: { state: result.state },
          });
        }
      });
    }
  } catch (err) {
    console.error("Poker ticker failed", err);
  } finally {
    globalThis.pokerTicking = false;
  }
}

export function startPokerTicker() {
  if (globalThis.pokerTicker) return;
  globalThis.pokerTicker = setInterval(tickPokerTables, 1000);
}
