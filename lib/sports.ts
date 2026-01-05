import type { PrismaClient } from "@prisma/client";

export type SportsPick = "home" | "draw" | "away";

export function formatOdds(odds: number) {
  return (odds / 100).toFixed(2);
}

export async function ensureSportsSeed(prisma: PrismaClient) {
  const existing = await prisma.sportsLeague.findFirst();
  if (existing) return;

  const leagues = [
    { name: "Premier League", slug: "premier-league" },
    { name: "Bundesliga", slug: "bundesliga" },
  ];

  const leagueRecords = new Map<string, string>();
  for (const league of leagues) {
    const created = await prisma.sportsLeague.create({ data: league });
    leagueRecords.set(league.slug, created.id);
  }

  const teams = [
    { name: "Arsenal", slug: "arsenal", league: "premier-league" },
    { name: "Liverpool", slug: "liverpool", league: "premier-league" },
    { name: "Manchester City", slug: "man-city", league: "premier-league" },
    { name: "Chelsea", slug: "chelsea", league: "premier-league" },
    { name: "Bayern Munich", slug: "bayern", league: "bundesliga" },
    { name: "Borussia Dortmund", slug: "dortmund", league: "bundesliga" },
    { name: "RB Leipzig", slug: "leipzig", league: "bundesliga" },
    { name: "Bayer Leverkusen", slug: "leverkusen", league: "bundesliga" },
  ];

  const teamRecords = new Map<string, string>();
  for (const team of teams) {
    const leagueId = leagueRecords.get(team.league);
    if (!leagueId) continue;
    const created = await prisma.sportsTeam.create({
      data: {
        name: team.name,
        slug: team.slug,
        leagueId,
      },
    });
    teamRecords.set(team.slug, created.id);
  }

  const now = Date.now();
  const daysFromNow = (days: number) => new Date(now + days * 24 * 60 * 60 * 1000);

  const matches = [
    {
      league: "premier-league",
      home: "arsenal",
      away: "liverpool",
      startTime: daysFromNow(1),
      oddsHome: 195,
      oddsDraw: 330,
      oddsAway: 265,
    },
    {
      league: "premier-league",
      home: "chelsea",
      away: "man-city",
      startTime: daysFromNow(2),
      oddsHome: 280,
      oddsDraw: 340,
      oddsAway: 210,
    },
    {
      league: "bundesliga",
      home: "bayern",
      away: "dortmund",
      startTime: daysFromNow(1.5),
      oddsHome: 175,
      oddsDraw: 360,
      oddsAway: 340,
    },
    {
      league: "bundesliga",
      home: "leipzig",
      away: "leverkusen",
      startTime: daysFromNow(3),
      oddsHome: 210,
      oddsDraw: 320,
      oddsAway: 250,
    },
  ];

  for (const match of matches) {
    const leagueId = leagueRecords.get(match.league);
    const homeTeamId = teamRecords.get(match.home);
    const awayTeamId = teamRecords.get(match.away);
    if (!leagueId || !homeTeamId || !awayTeamId) continue;
    await prisma.sportsMatch.create({
      data: {
        leagueId,
        homeTeamId,
        awayTeamId,
        startTime: match.startTime,
        oddsHome: match.oddsHome,
        oddsDraw: match.oddsDraw,
        oddsAway: match.oddsAway,
      },
    });
  }
}
