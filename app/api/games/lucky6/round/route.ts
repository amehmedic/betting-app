import { NextResponse } from "next/server";
import { getLucky6RoundTimes, LUCKY6_ROUND_MS } from "@/lib/lucky6-rounds";

export const runtime = "nodejs";

export async function GET() {
  const now = Date.now();
  const { roundId, roundStart, nextRound } = getLucky6RoundTimes(now);

  return NextResponse.json({
    ok: true,
    now,
    roundId,
    roundStart,
    nextRound,
    roundMs: LUCKY6_ROUND_MS,
  });
}
