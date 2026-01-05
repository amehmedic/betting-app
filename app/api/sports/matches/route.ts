import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth";
import { ensureSportsSeed } from "@/lib/sports";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureSportsSeed(prisma);

  const [matches, bets] = await Promise.all([
    prisma.sportsMatch.findMany({
      include: {
        league: true,
        homeTeam: true,
        awayTeam: true,
      },
      orderBy: [{ startTime: "asc" }],
    }),
    prisma.sportsBet.findMany({
      where: { userId: session.user.id },
      include: {
        match: {
          include: {
            league: true,
            homeTeam: true,
            awayTeam: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return NextResponse.json({
    ok: true,
    isAdmin:
      (session.user as any)?.role === "admin" || process.env.NODE_ENV === "development",
    matches: matches.map((match) => ({
      id: match.id,
      startTime: match.startTime.toISOString(),
      status: match.status,
      result: match.result,
      odds: {
        home: match.oddsHome,
        draw: match.oddsDraw,
        away: match.oddsAway,
      },
      league: { name: match.league.name, slug: match.league.slug },
      homeTeam: { name: match.homeTeam.name, slug: match.homeTeam.slug },
      awayTeam: { name: match.awayTeam.name, slug: match.awayTeam.slug },
    })),
    bets: bets.map((bet) => ({
      id: bet.id,
      matchId: bet.matchId,
      pick: bet.pick,
      odds: bet.odds,
      stakeCents: bet.stakeCents,
      payoutCents: bet.payoutCents ?? null,
      status: bet.status,
      createdAt: bet.createdAt.toISOString(),
      match: {
        id: bet.match.id,
        startTime: bet.match.startTime.toISOString(),
        league: { name: bet.match.league.name, slug: bet.match.league.slug },
        homeTeam: { name: bet.match.homeTeam.name },
        awayTeam: { name: bet.match.awayTeam.name },
      },
    })),
  });
}
