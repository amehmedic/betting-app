import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLucky6RoundId } from "@/lib/lucky6-rounds";
import { Lucky6Ball, Lucky6Color, runLucky6Draw } from "@/lib/lucky6";

export const runtime = "nodejs";

const MAX_LIMIT = 10;

async function ensureRound(roundId: number) {
  const existing = await prisma.lucky6Round.findUnique({ where: { roundId } });
  if (existing) return existing;

  const draw = runLucky6Draw(roundId);
  return prisma.lucky6Round.create({
    data: {
      roundId,
      balls: draw.balls,
      completionOrder: draw.completionOrder,
    },
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawLimit = Number.parseInt(searchParams.get("limit") ?? "5", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT) : 5;

  const currentRoundId = getLucky6RoundId(Date.now());
  const roundIds = Array.from({ length: limit }, (_, idx) => currentRoundId - idx).filter((id) => id >= 0);

  const rounds = await Promise.all(roundIds.map((id) => ensureRound(id)));

  return NextResponse.json({
    ok: true,
    rounds: rounds.map((round) => {
      const balls = round.balls as Lucky6Ball[];
      return {
        roundId: round.roundId,
        draw: {
          balls,
          completionOrder: round.completionOrder as Partial<Record<Lucky6Color, number>>,
          firstBall: balls[0],
        },
        createdAt: round.createdAt.toISOString(),
      };
    }),
  });
}
