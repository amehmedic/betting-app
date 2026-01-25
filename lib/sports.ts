import type { PrismaClient } from "@prisma/client";

export type SportsPick = "home" | "draw" | "away";

export function formatOdds(odds: number) {
  return (odds / 100).toFixed(2);
}

type OddsApiOutcome = {
  name: string;
  price: number;
};

type OddsApiMarket = {
  key: string;
  outcomes: OddsApiOutcome[];
};

type OddsApiBookmaker = {
  key: string;
  markets: OddsApiMarket[];
};

type OddsApiEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: OddsApiBookmaker[];
};

type LeagueConfig = {
  name: string;
  slug: string;
  sport: string;
  sportKey: string;
};

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

const LEAGUE_CONFIGS: LeagueConfig[] = [
  {
    name: "Premier League",
    slug: "premier-league",
    sport: "football",
    sportKey: "soccer_epl",
  },
  {
    name: "NBA",
    slug: "nba",
    sport: "basketball",
    sportKey: "basketball_nba",
  },
  {
    name: "ATP Tour",
    slug: "atp",
    sport: "tennis",
    sportKey: "tennis_atp",
  },
];

type OddsSyncState = {
  lastSyncAt: number;
};

function getOddsApiKey() {
  return process.env.ODDS_API_KEY ?? process.env.THE_ODDS_API_KEY ?? "";
}

function getOddsSyncState() {
  const globalState = globalThis as typeof globalThis & { __sportsOddsSync?: OddsSyncState };
  if (!globalState.__sportsOddsSync) {
    globalState.__sportsOddsSync = { lastSyncAt: 0 };
  }
  return globalState.__sportsOddsSync;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function decimalToOddsInt(price: number) {
  return Math.max(1, Math.round(price * 100));
}

async function findOrCreateLeague(prisma: PrismaClient, config: LeagueConfig) {
  return prisma.sportsLeague.upsert({
    where: { slug: config.slug },
    update: { name: config.name, sport: config.sport },
    create: { name: config.name, slug: config.slug, sport: config.sport },
  });
}

async function findOrCreateTeam(
  prisma: PrismaClient,
  teamName: string,
  leagueId: string,
  leagueSlug: string
) {
  const existing = await prisma.sportsTeam.findFirst({
    where: { leagueId, name: teamName },
  });
  if (existing) return existing;
  const slug = `${leagueSlug}-${slugify(teamName)}`;
  return prisma.sportsTeam.create({
    data: {
      name: teamName,
      slug,
      leagueId,
    },
  });
}

function findH2HMarket(event: OddsApiEvent) {
  const bookmakers = event.bookmakers ?? [];
  for (const bookmaker of bookmakers) {
    const market = bookmaker.markets.find((item) => item.key === "h2h");
    if (market) return market;
  }
  return null;
}

export async function syncSportsOdds(
  prisma: PrismaClient,
  options: { force?: boolean } = {}
) {
  const apiKey = getOddsApiKey();
  if (!apiKey) {
    throw new Error("Missing ODDS_API_KEY");
  }

  const state = getOddsSyncState();
  const refreshMinutes = Number(process.env.SPORTS_ODDS_REFRESH_MINUTES ?? "15");
  const refreshMs = Math.max(1, refreshMinutes) * 60 * 1000;
  if (!options.force && Date.now() - state.lastSyncAt < refreshMs) {
    return;
  }

  const regions = process.env.ODDS_API_REGIONS ?? "us";
  const daysAhead = Number(process.env.SPORTS_ODDS_DAYS_AHEAD ?? "7");
  const windowMs = Math.max(1, daysAhead) * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const cutoff = now + windowMs;

  for (const league of LEAGUE_CONFIGS) {
    const leagueRecord = await findOrCreateLeague(prisma, league);
    const url = new URL(`${ODDS_API_BASE}/sports/${league.sportKey}/odds/`);
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("regions", regions);
    url.searchParams.set("markets", "h2h");
    url.searchParams.set("oddsFormat", "decimal");
    url.searchParams.set("dateFormat", "iso");

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Odds API error ${res.status}: ${detail}`);
    }

    const events = (await res.json()) as OddsApiEvent[];
    for (const event of events) {
      const startTime = new Date(event.commence_time);
      if (!Number.isFinite(startTime.getTime())) continue;
      if (startTime.getTime() <= now) continue;
      if (startTime.getTime() > cutoff) continue;

      const market = findH2HMarket(event);
      if (!market) continue;
      const outcomeMap = new Map(
        market.outcomes.map((outcome) => [outcome.name, outcome.price])
      );
      const homePrice = outcomeMap.get(event.home_team);
      const awayPrice = outcomeMap.get(event.away_team);
      if (typeof homePrice !== "number" || typeof awayPrice !== "number") {
        continue;
      }
      const drawPrice = outcomeMap.get("Draw");
      const oddsDraw = typeof drawPrice === "number" ? decimalToOddsInt(drawPrice) : 0;

      const homeTeam = await findOrCreateTeam(
        prisma,
        event.home_team,
        leagueRecord.id,
        league.slug
      );
      const awayTeam = await findOrCreateTeam(
        prisma,
        event.away_team,
        leagueRecord.id,
        league.slug
      );

      const existing = await prisma.sportsMatch.findUnique({
        where: { externalId: event.id },
      });
      if (existing && existing.status !== "scheduled") {
        continue;
      }

      const data = {
        leagueId: leagueRecord.id,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        startTime,
        oddsHome: decimalToOddsInt(homePrice),
        oddsDraw,
        oddsAway: decimalToOddsInt(awayPrice),
      };

      if (existing) {
        await prisma.sportsMatch.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await prisma.sportsMatch.create({
          data: {
            externalId: event.id,
            ...data,
          },
        });
      }
    }
  }

  state.lastSyncAt = Date.now();
}

export async function ensureSportsSeed(prisma: PrismaClient) {
  const existing = await prisma.sportsLeague.findFirst();
  if (existing) return;

  const leagues = [
    { name: "Premier League", slug: "premier-league", sport: "football" },
    { name: "NBA", slug: "nba", sport: "basketball" },
    { name: "ATP Tour", slug: "atp", sport: "tennis" },
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
    { name: "Tottenham", slug: "tottenham", league: "premier-league" },
    { name: "Manchester United", slug: "man-united", league: "premier-league" },
    { name: "Los Angeles Lakers", slug: "lakers", league: "nba" },
    { name: "Golden State Warriors", slug: "warriors", league: "nba" },
    { name: "Boston Celtics", slug: "celtics", league: "nba" },
    { name: "Chicago Bulls", slug: "bulls", league: "nba" },
    { name: "Novak Djokovic", slug: "djokovic", league: "atp" },
    { name: "Carlos Alcaraz", slug: "alcaraz", league: "atp" },
    { name: "Jannik Sinner", slug: "sinner", league: "atp" },
    { name: "Daniil Medvedev", slug: "medvedev", league: "atp" },
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
      league: "premier-league",
      home: "tottenham",
      away: "man-united",
      startTime: daysFromNow(3),
      oddsHome: 240,
      oddsDraw: 325,
      oddsAway: 260,
    },
    {
      league: "nba",
      home: "lakers",
      away: "warriors",
      startTime: daysFromNow(1),
      oddsHome: 185,
      oddsDraw: 0,
      oddsAway: 205,
    },
    {
      league: "nba",
      home: "celtics",
      away: "bulls",
      startTime: daysFromNow(2),
      oddsHome: 160,
      oddsDraw: 0,
      oddsAway: 240,
    },
    {
      league: "atp",
      home: "djokovic",
      away: "alcaraz",
      startTime: daysFromNow(2.5),
      oddsHome: 170,
      oddsDraw: 0,
      oddsAway: 220,
    },
    {
      league: "atp",
      home: "sinner",
      away: "medvedev",
      startTime: daysFromNow(4),
      oddsHome: 190,
      oddsDraw: 0,
      oddsAway: 200,
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
