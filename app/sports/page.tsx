"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import clsx from "clsx";

type Match = {
  id: string;
  startTime: string;
  status: string;
  result: string | null;
  odds: { home: number; draw: number; away: number };
  league: { name: string; slug: string; sport: string };
  homeTeam: { name: string; slug: string };
  awayTeam: { name: string; slug: string };
};

type Bet = {
  id: string;
  matchId: string;
  pick: "home" | "draw" | "away";
  odds: number;
  stakeCents: number;
  payoutCents: number | null;
  status: string;
  createdAt: string;
  match: {
    id: string;
    startTime: string;
    league: { name: string; slug: string; sport: string };
    homeTeam: { name: string };
    awayTeam: { name: string };
  };
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const pickLabels = {
  home: "Home",
  draw: "Draw",
  away: "Away",
} as const;

const sportGroups = [
  { key: "football", label: "Football" },
  { key: "basketball", label: "Basketball" },
  { key: "tennis", label: "Tennis" },
] as const;

type SportKey = (typeof sportGroups)[number]["key"];

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDayLabel(date: Date, index: number) {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function SportsPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedPick, setSelectedPick] = useState<Record<string, "home" | "draw" | "away" | null>>(
    {}
  );
  const [stakeByMatch, setStakeByMatch] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeDayKey, setActiveDayKey] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sports/matches", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Unable to load matches");
        return;
      }
      setMatches(json.matches ?? []);
      setBets(json.bets ?? []);
    } catch (err) {
      console.error(err);
      setError("Unable to load matches");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const days = useMemo(() => {
    const list: Date[] = [];
    const start = new Date();
    for (let i = 0; i < 7; i += 1) {
      const next = new Date(start);
      next.setDate(start.getDate() + i);
      list.push(next);
    }
    return list;
  }, []);

  const dayKeys = useMemo(() => days.map((date) => dateKey(date)), [days]);
  const selectedDayIndex = activeDayKey ? dayKeys.indexOf(activeDayKey) : 0;
  const resolvedDayIndex = selectedDayIndex >= 0 ? selectedDayIndex : 0;
  const selectedDayKey = dayKeys[resolvedDayIndex];

  const groupedMatches = useMemo(() => {
    const groups = new Map<SportKey, Map<string, Match[]>>();
    matches.forEach((match) => {
      const sport =
        sportGroups.find((item) => item.key === match.league.sport)?.key ?? "football";
      const key = dateKey(new Date(match.startTime));
      if (!groups.has(sport)) {
        groups.set(sport, new Map());
      }
      const dayMap = groups.get(sport)!;
      const list = dayMap.get(key) ?? [];
      list.push(match);
      dayMap.set(key, list);
    });
    for (const dayMap of groups.values()) {
      for (const matchesForDay of dayMap.values()) {
        matchesForDay.sort(
          (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );
      }
    }
    return groups;
  }, [matches]);

  const formatOdds = (odds: number) => (odds / 100).toFixed(2);

  async function placeBet(match: Match) {
    if (busyId) return;
    const pick = selectedPick[match.id];
    const stake = stakeByMatch[match.id] ?? "5.00";
    const stakeValue = Number(stake);
    if (!pick) {
      setError("Select a pick first.");
      return;
    }
    if (pick === "draw" && match.odds.draw <= 0) {
      setError("Draw is not available for this match.");
      return;
    }
    if (!Number.isFinite(stakeValue) || stakeValue <= 0) {
      setError("Enter a valid stake.");
      return;
    }

    setBusyId(match.id);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/sports/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: match.id, pick, amount: stakeValue }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok !== true) {
        setError(json?.error ?? "Bet failed");
        return;
      }
      setMessage("Bet placed.");
      await load();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("wallet:update"));
      }
    } catch (err) {
      console.error(err);
      setError("Bet failed");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    if (!activeDayKey && dayKeys.length) {
      setActiveDayKey(dayKeys[0]);
      return;
    }
    if (activeDayKey && !dayKeys.includes(activeDayKey)) {
      setActiveDayKey(dayKeys[0] ?? null);
    }
  }, [activeDayKey, dayKeys]);

  return (
    <DashboardShell
      title="Sportsbook"
      description="Pre-match odds for upcoming fixtures."
    >
      <div className="space-y-6">
        {(message || error) && (
          <div
            className={clsx(
              "rounded-xl border px-4 py-3 text-sm",
              message ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-100" : "",
              error ? "border-rose-400/50 bg-rose-500/10 text-rose-100" : ""
            )}
          >
            {message ?? error}
          </div>
        )}

        {!loading && (
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-2">
            <div className="flex flex-wrap gap-2">
              {days.map((day, index) => {
                const key = dayKeys[index];
                const active = key === selectedDayKey;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveDayKey(key)}
                    className={clsx(
                      "rounded-full px-3 py-1 text-xs font-semibold transition",
                      active
                        ? "bg-[#c5305f] text-white shadow-sm shadow-[#c5305f]/40"
                        : "text-slate-300 hover:text-white hover:bg-white/5"
                    )}
                  >
                    {formatDayLabel(day, index)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-sm text-slate-400">Loading matches...</div>
        ) : (
          sportGroups.map((sport) => {
            const dayMap = groupedMatches.get(sport.key) ?? new Map<string, Match[]>();
            const dayMatches = selectedDayKey ? dayMap.get(selectedDayKey) ?? [] : [];
            return (
              <section key={sport.key} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">{sport.label}</h2>
                  <span className="text-xs uppercase tracking-wide text-slate-400">
                    {dayMatches.length} matches
                  </span>
                </div>
                {dayMatches.length === 0 ? (
                  <div className="rounded-xl border border-white/5 bg-slate-950/40 px-4 py-3 text-xs text-slate-500">
                    No matches scheduled.
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {dayMatches.map((match) => {
                      const hasDraw = match.odds.draw > 0;
                      const options = hasDraw
                        ? (["home", "draw", "away"] as const)
                        : (["home", "away"] as const);
                      const currentPick = selectedPick[match.id];
                      const pick = options.includes(currentPick as typeof options[number])
                        ? currentPick
                        : null;
                      const stakeValue = stakeByMatch[match.id] ?? "5.00";
                      const startTime = new Date(match.startTime);
                      const isOpen =
                        match.status === "scheduled" && startTime.getTime() > Date.now();
                      return (
                        <div
                          key={match.id}
                          className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 shadow-lg shadow-black/30"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-semibold text-white">
                                {match.homeTeam.name} vs {match.awayTeam.name}
                              </div>
                              <div className="text-xs text-slate-400">
                                {match.league.name} · {startTime.toLocaleString()}
                              </div>
                            </div>
                            <div className="text-xs uppercase tracking-wide text-slate-500">
                              {match.status === "finished" ? "Final" : "Scheduled"}
                            </div>
                          </div>

                          <div
                            className={clsx(
                              "mt-4 grid gap-2",
                              hasDraw ? "sm:grid-cols-3" : "sm:grid-cols-2"
                            )}
                          >
                            {options.map((option) => (
                              <button
                                key={`${match.id}-${option}`}
                                type="button"
                                disabled={!isOpen}
                                onClick={() =>
                                  setSelectedPick((prev) => ({
                                    ...prev,
                                    [match.id]: option,
                                  }))
                                }
                                className={clsx(
                                  "rounded-xl border px-3 py-2 text-left text-sm transition",
                                  pick === option
                                    ? "border-[#c5305f] bg-[#1a0d18] text-white"
                                    : "border-white/10 bg-white/5 text-slate-300 hover:border-white/30",
                                  !isOpen && "cursor-not-allowed opacity-60"
                                )}
                              >
                                <div className="text-xs uppercase tracking-wide text-slate-400">
                                  {pickLabels[option]}
                                </div>
                                <div className="text-sm font-semibold text-white">
                                  {formatOdds(match.odds[option])}
                                </div>
                              </button>
                            ))}
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2">
                              <label className="text-xs uppercase tracking-wide text-slate-400">
                                Stake
                              </label>
                              <input
                                type="number"
                                min={0.01}
                                step={0.01}
                                value={stakeValue}
                                onChange={(e) =>
                                  setStakeByMatch((prev) => ({
                                    ...prev,
                                    [match.id]: e.target.value,
                                  }))
                                }
                                className="w-24 rounded border border-white/20 bg-slate-900/60 px-2 py-1 text-sm text-white focus:border-[#5c7cfa] focus:outline-none"
                              />
                            </div>
                            <button
                              type="button"
                              disabled={!isOpen || !pick || busyId === match.id}
                              onClick={() => void placeBet(match)}
                              className="rounded-lg bg-[#c5305f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a61a42] disabled:cursor-not-allowed disabled:bg-[#c5305f]/50"
                            >
                              {busyId === match.id ? "Placing..." : "Place bet"}
                            </button>
                            {!isOpen && (
                              <span className="text-xs text-slate-500">Betting closed</span>
                            )}
                          </div>

                          {match.status === "finished" && match.result && (
                            <div className="mt-3 text-xs font-semibold text-emerald-200">
                              Result:{" "}
                              {pickLabels[match.result as "home" | "draw" | "away"] ?? match.result}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">My bets</h2>
            <span className="text-xs uppercase tracking-wide text-slate-400">
              {bets.length} recent
            </span>
          </div>
          {bets.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-400">
              No bets yet.
            </div>
          ) : (
            <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60">
              {bets.map((bet) => (
                <div key={bet.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                  <div>
                    <div className="font-semibold text-white">
                      {bet.match.homeTeam.name} vs {bet.match.awayTeam.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      {bet.match.league.name} · {new Date(bet.match.startTime).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    {pickLabels[bet.pick]}
                  </div>
                  <div className="text-xs text-slate-400">
                    Odds {formatOdds(bet.odds)}
                  </div>
                  <div className="font-mono text-sm text-slate-100">
                    Stake {usd.format(bet.stakeCents / 100)}
                  </div>
                  <div
                    className={clsx(
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      bet.status === "won"
                        ? "bg-emerald-500/15 text-emerald-200"
                        : bet.status === "lost"
                        ? "bg-rose-500/15 text-rose-200"
                        : bet.status === "void"
                        ? "bg-slate-500/20 text-slate-200"
                        : "bg-white/10 text-slate-200"
                    )}
                  >
                    {bet.status}
                  </div>
                  {bet.status !== "pending" && (
                    <div className="font-mono text-sm text-slate-200">
                      Return {usd.format((bet.payoutCents ?? 0) / 100)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
