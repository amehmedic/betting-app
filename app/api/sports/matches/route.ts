import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth";
import { ensureSportsSeed, syncSportsOdds } from "@/lib/sports";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession(authConfig);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const oddsApiKey = process.env.ODDS_API_KEY ?? process.env.THE_ODDS_API_KEY ?? "";
  if (oddsApiKey) {
    try {
      await syncSportsOdds(prisma);
    } catch (err) {
      console.error("Sports odds sync failed:", err);
    }
  } else {
    await ensureSportsSeed(prisma);
  }

  const daysAhead = Number(process.env.SPORTS_ODDS_DAYS_AHEAD ?? "7");
  const windowMs = Math.max(1, daysAhead) * 24 * 60 * 60 * 1000;
  const rangeStart = new Date();
  rangeStart.setHours(0, 0, 0, 0);
  const end = new Date(rangeStart.getTime() + windowMs);
  const baseMatchFilter = { startTime: { gte: rangeStart, lte: end } };
  const matchFilter = oddsApiKey
    ? { ...baseMatchFilter, externalId: { not: null } }
    : baseMatchFilter;
  const betFilter = oddsApiKey
    ? { userId: session.user.id, match: { is: { externalId: { not: null } } } }
    : { userId: session.user.id };

  const [matches, bets] = await Promise.all([
    prisma.sportsMatch.findMany({
      where: matchFilter,
      include: {
        league: true,
        homeTeam: true,
        awayTeam: true,
      },
      orderBy: [{ startTime: "asc" }],
    }),
    prisma.sportsBet.findMany({
      where: betFilter,
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
      league: {
        name: match.league.name,
        slug: match.league.slug,
        sport: match.league.sport,
      },
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
        league: {
          name: bet.match.league.name,
          slug: bet.match.league.slug,
          sport: bet.match.league.sport,
        },
        homeTeam: { name: bet.match.homeTeam.name },
        awayTeam: { name: bet.match.awayTeam.name },
      },
    })),
  });
}
