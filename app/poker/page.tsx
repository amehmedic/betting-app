"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import type { Card } from "@/lib/blackjack";
import clsx from "clsx";

const BUY_INS = [100, 1000, 10000] as const;
const POLL_INTERVAL_MS = 3000;
const faceDownAsset = "/cards/FACE-DOWN.svg";
const defaultAvatarAsset = "/avatars/default.svg";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

type TableSeat = {
  seatIndex: number;
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  stackCents: number;
  status: "active" | "folded" | "out" | "allin";
  betCents: number;
  hand: Card[];
  hasActed: boolean;
  lastAction: string | null;
  isYou: boolean;
};

type TableState = {
  phase: "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown";
  dealerIndex: number;
  community: Card[];
  potCents: number;
  currentBet: number;
  minRaise: number;
  turnIndex: number;
  actionDeadline: number;
  pendingStartAt: number;
  smallBlindCents: number;
  bigBlindCents: number;
  lastRound: {
    completedAt: number;
    expiresAt: number;
    potCents: number;
    community: Card[];
    results: Array<{
      seatIndex: number;
      userId: string;
      result: "win" | "loss" | "tie";
      hand: { cards: Card[]; bestLabel?: string; bestRanks?: string };
      netCents?: number;
    }>;
  } | null;
  seats: TableSeat[];
};

type StatusResponse = {
  ok: true;
  userId: string;
  tiers: Array<{ buyIn: number; seated: number }>;
  seated: { tableId: string; seatIndex: number; buyIn: number | null } | null;
  table: TableState | null;
};

const suitCode: Record<Card["suit"], string> = {
  clubs: "C",
  diamonds: "D",
  hearts: "H",
  spades: "S",
};

const suitMeta: Record<Card["suit"], { symbol: string; color: string }> = {
  clubs: { symbol: "♣", color: "#86efac" },
  spades: { symbol: "♠", color: "#cbd5f5" },
  hearts: { symbol: "♥", color: "#f472b6" },
  diamonds: { symbol: "♦", color: "#fb7185" },
};

const suitFileMap: Record<Card["suit"], string> = {
  spades: "SPADE",
  hearts: "HEART",
  diamonds: "DIAMOND",
  clubs: "CLUB",
};

const CARD_SIZES = {
  sm: { width: 67, height: 95 },
  md: { width: 99, height: 143 },
};

const seatPositions = [
  "seat seat--top",
  "seat seat--top-right",
  "seat seat--bottom-right",
  "seat seat--bottom",
  "seat seat--bottom-left",
  "seat seat--top-left",
];

function formatCard(card: Card) {
  return `${card.rank}${suitCode[card.suit]}`;
}

function cardAssetPath(card: Card): string | null {
  const suit = suitFileMap[card.suit];
  if (!suit) return null;
  if (card.rank === "A") return `/cards/${suit}-1.svg`;
  if (card.rank === "J") return `/cards/${suit}-11-JACK.svg`;
  if (card.rank === "Q") return `/cards/${suit}-12-QUEEN.svg`;
  if (card.rank === "K") return `/cards/${suit}-13-KING.svg`;
  return `/cards/${suit}-${card.rank}.svg`;
}

function PlayingCard({
  card,
  hidden = false,
  size = "md",
}: {
  card?: Card;
  hidden?: boolean;
  size?: "sm" | "md";
}) {
  const { width, height } = CARD_SIZES[size];
  if (hidden) {
    return (
      <div className="playing-card playing-card--back" style={{ width, height }}>
        {faceDownAsset ? (
          <img
            src={faceDownAsset}
            alt="Face down card"
            width={width}
            height={height}
            className="playing-card__image"
          />
        ) : (
          <div className="playing-card__pattern" />
        )}
      </div>
    );
  }
  if (!card) return null;
  const meta = suitMeta[card.suit];
  const asset = cardAssetPath(card);
  return (
    <div className="playing-card playing-card--front" style={{ width, height }} aria-label={formatCard(card)}>
      {asset ? (
        <img
          src={asset}
          alt={formatCard(card)}
          width={width}
          height={height}
          className="playing-card__image"
        />
      ) : (
        <>
          <div className="playing-card__corner playing-card__corner--top">
            <span>{card.rank}</span>
            <span style={{ color: meta.color }}>{meta.symbol}</span>
          </div>
          <div className="playing-card__center" style={{ color: meta.color }}>
            {meta.symbol}
          </div>
          <div className="playing-card__corner playing-card__corner--bottom">
            <span>{card.rank}</span>
            <span style={{ color: meta.color }}>{meta.symbol}</span>
          </div>
        </>
      )}
    </div>
  );
}

export default function PokerPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raiseTo, setRaiseTo] = useState("");
  const [now, setNow] = useState(Date.now());
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const table = status?.table ?? null;
  const seated = status?.seated ?? null;

  const seatMap = useMemo(() => {
    const map = new Map<number, TableSeat>();
    table?.seats.forEach((seat) => map.set(seat.seatIndex, seat));
    return map;
  }, [table?.seats]);

  const mySeat = useMemo(() => table?.seats.find((seat) => seat.isYou) ?? null, [table?.seats]);
  const seatOrder = useMemo(() => {
    const indices = Array.from({ length: seatPositions.length }, (_, idx) => idx);
    if (!mySeat || !table?.seats?.length) return indices;
    const occupied = new Set(table.seats.map((seat) => seat.seatIndex));
    const clockwise = indices.map((_, offset) => (mySeat.seatIndex + offset) % indices.length);
    const occupiedOthers = clockwise.filter(
      (idx) => idx !== mySeat.seatIndex && occupied.has(idx)
    );
    const empty = clockwise.filter(
      (idx) => idx !== mySeat.seatIndex && !occupied.has(idx)
    );
    return [mySeat.seatIndex, ...occupiedOthers, ...empty];
  }, [mySeat, table?.seats]);
  const isMyTurn = !!table && mySeat?.seatIndex === table.turnIndex && mySeat?.status === "active";
  const callAmountCents = table ? Math.max(0, table.currentBet - (mySeat?.betCents ?? 0)) : 0;
  const canCheck = table && callAmountCents === 0;
  const minRaiseCents = table ? table.currentBet + table.minRaise : 0;

  const timeLeft = table?.actionDeadline
    ? Math.max(0, Math.ceil((table.actionDeadline - now) / 1000))
    : 0;
  const pendingStartLeft = table?.pendingStartAt
    ? Math.max(0, Math.ceil((table.pendingStartAt - now) / 1000))
    : 0;
  const lastRound = table?.lastRound ?? null;
  const lastRoundLeft = lastRound ? Math.max(0, Math.ceil((lastRound.expiresAt - now) / 1000)) : 0;
  const communityCards = table?.community.length
    ? table.community
    : lastRound && lastRoundLeft > 0
      ? lastRound.community
      : [];
  const potCents = lastRound && lastRoundLeft > 0 ? lastRound.potCents : table?.potCents ?? 0;
  const showWaitingMessage = table?.phase === "waiting" && !(lastRound && lastRoundLeft > 0);

  const lastRoundSeatHands = useMemo(() => {
    if (!lastRound || lastRoundLeft <= 0) return new Map<number, Card[]>();
    return new Map(lastRound.results.map((result) => [result.seatIndex, result.hand.cards]));
  }, [lastRound, lastRoundLeft]);
  const lastRoundSeatLabels = useMemo(() => {
    if (!lastRound || lastRoundLeft <= 0) return new Map<number, string>();
    return new Map(
      lastRound.results.map((result) => [
        result.seatIndex,
        result.hand.bestLabel ?? "Showdown",
      ])
    );
  }, [lastRound, lastRoundLeft]);
  const lastRoundSeatNet = useMemo(() => {
    if (!lastRound || lastRoundLeft <= 0) return new Map<number, number>();
    return new Map(
      lastRound.results.map((result) => [result.seatIndex, result.netCents ?? 0])
    );
  }, [lastRound, lastRoundLeft]);

  const formatNetCents = (netCents: number) => {
    if (netCents === 0) return usd.format(0);
    const sign = netCents > 0 ? "+" : "-";
    return `${sign}${usd.format(Math.abs(netCents) / 100)}`;
  };

  const winningHands = useMemo(() => {
    if (!lastRound || lastRoundLeft <= 0) return [];
    return lastRound.results.filter((result) => result.result === "win" || result.result === "tie");
  }, [lastRound, lastRoundLeft]);
  const winningSeatSet = useMemo(() => {
    if (!lastRound || lastRoundLeft <= 0) return new Set<number>();
    return new Set(
      lastRound.results
        .filter((result) => result.result === "win" || result.result === "tie")
        .map((result) => result.seatIndex)
    );
  }, [lastRound, lastRoundLeft]);
  const myLastResult = useMemo(() => {
    if (!lastRound || lastRoundLeft <= 0 || !mySeat) return null;
    return lastRound.results.find((result) => result.seatIndex === mySeat.seatIndex) ?? null;
  }, [lastRound, lastRoundLeft, mySeat]);

  const winnerLabel = useMemo(() => {
    if (winningHands.length === 0) return "Showdown";
    const label = winningHands[0].hand.bestLabel;
    return label ?? "Showdown";
  }, [winningHands]);

  const refreshStatus = async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch("/api/games/poker/status", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as StatusResponse | { error?: string } | null;
      if (!res.ok || !json || (json as any).ok !== true) {
        setError((json as any)?.error ?? "Unable to load poker status");
        return;
      }
      setStatus(json as StatusResponse);
    } catch (err) {
      console.error(err);
      setError("Unable to load poker status");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    refreshStatus();
    const interval = window.setInterval(() => refreshStatus({ silent: true }), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  async function joinTable(buyIn: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/games/poker/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyIn }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json || (json as any).ok !== true) {
        setError((json as any)?.error ?? "Unable to join table");
      } else {
        await refreshStatus();
        window.dispatchEvent(new Event("wallet:update"));
      }
    } catch (err) {
      console.error(err);
      setError("Unable to join table");
    } finally {
      setBusy(false);
    }
  }

  async function confirmLeave() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/games/poker/leave", { method: "POST" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json || (json as any).ok !== true) {
        setError((json as any)?.error ?? "Unable to leave table");
      } else {
        await refreshStatus();
        window.dispatchEvent(new Event("wallet:update"));
      }
    } catch (err) {
      console.error(err);
      setError("Unable to leave table");
    } finally {
      setBusy(false);
      setLeaveConfirmOpen(false);
    }
  }

  async function leaveTable() {
    if (busy) return;
    if (table && table.phase !== "waiting") {
      setLeaveConfirmOpen(true);
      return;
    }
    await confirmLeave();
  }

  async function act(action: "call" | "check" | "raise" | "fold") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload =
        action === "raise"
          ? { action, raiseTo: Number.parseFloat(raiseTo) }
          : { action };
      const res = await fetch("/api/games/poker/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json || (json as any).ok !== true) {
        setError((json as any)?.error ?? "Action failed");
      } else {
        setRaiseTo("");
        await refreshStatus();
      }
    } catch (err) {
      console.error(err);
      setError("Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardShell title="">
      <div className="space-y-6 text-center">
        <h1 className="text-3xl font-semibold text-white">Poker</h1>

        {!seated && (
          <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 text-left">
            <div className="text-sm font-semibold text-white">Choose a buy-in</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {BUY_INS.map((tier) => {
                const seatedCount = status?.tiers.find((t) => t.buyIn === tier)?.seated ?? 0;
                return (
                  <div
                    key={tier}
                    className="rounded-xl border border-white/10 bg-slate-950/60 p-4 text-center"
                  >
                    <div className="text-xs uppercase tracking-wide text-slate-400">Buy-in</div>
                    <div className="mt-1 text-2xl font-semibold text-white">{usd.format(tier)}</div>
                    <div className="mt-2 text-xs text-slate-400">{seatedCount} seated</div>
                    <button
                      type="button"
                      onClick={() => joinTable(tier)}
                      disabled={busy}
                      className="mt-3 w-full rounded-lg bg-[#c5305f] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#a61a42] disabled:cursor-not-allowed disabled:bg-[#c5305f]/40"
                    >
                      Join table
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {seated && table && (
          <section className="rounded-2xl border border-white/10 bg-slate-950/60 p-5 text-left">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={leaveTable}
                disabled={busy}
                className="rounded-md border border-white/20 px-3 py-1 text-xs text-slate-200 transition hover:border-white/60 disabled:opacity-50"
              >
                Leave table
              </button>
            </div>

            <div className="mt-6 poker-table">
              <div className="poker-table__felt">
                <div className="poker-table__center">
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    {communityCards.map((card, idx) => (
                      <PlayingCard key={`community-${idx}`} card={card} size="sm" />
                    ))}
                  </div>
                  <div className="mt-3 text-sm font-semibold text-slate-100">
                    Pot {usd.format(potCents / 100)}
                  </div>
                  {showWaitingMessage && (
                    <div className="mt-2 text-sm font-medium text-slate-200">
                      {pendingStartLeft > 0
                        ? `Next hand starts in ${pendingStartLeft}s`
                        : "Waiting for players…"}
                    </div>
                  )}
                  {lastRound && lastRoundLeft > 0 && (
                    <div className="mt-3 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-xs text-slate-100">
                      <div className="text-[10px] uppercase tracking-wide text-slate-300">Winning Hand: {winnerLabel}</div>
                      <div className="mt-2 poker-results-row">
                        <div className="poker-results-row__winners">
                          {winningHands.length === 0 ? (
                            <div className="text-xs text-emerald-100">Hand complete.</div>
                          ) : (
                            winningHands.map((winner) => {
                              const seat = seatMap.get(winner.seatIndex);
                              const name = seat ? (seat.isYou ? "You" : seat.username ?? "Player") : "Player";
                              return (
                                <div key={`winner-${winner.seatIndex}`} className="poker-winner">
                                  <div className="poker-winner__name">
                                    Winner: {name}
                                    <span className="poker-winner__tag">{winner.hand.bestLabel ?? "Showdown"}</span>
                                  </div>
                                  <div className="poker-winner__hand">
                                    {winner.hand.cards.map((card, idx) => (
                                      <PlayingCard key={`winner-${winner.seatIndex}-${idx}`} card={card} size="sm" />
                                    ))}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                        {myLastResult && myLastResult.result === "loss" && (
                          <div className="poker-compare poker-compare--loss">
                            <div className="poker-compare__label">
                              <span>Your hand lost</span>
                              <span className="poker-compare__tag">
                                {myLastResult.hand.bestLabel ?? "Showdown"}
                              </span>
                            </div>
                            <div className="poker-compare__hand">
                              {myLastResult.hand.cards.map((card, idx) => (
                                <PlayingCard key={`my-last-${idx}`} card={card} size="sm" />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {lastRound && lastRoundLeft > 0 && (
                    <div className="mt-2 text-xs text-slate-300">Next hand in {lastRoundLeft}s</div>
                  )}
                </div>
              </div>

              {seatPositions.map((pos, positionIndex) => {
                const seatIndex = seatOrder[positionIndex];
                const seat = seatMap.get(seatIndex);
                const isDealer = table.dealerIndex === seatIndex;
                const isTurn = table.turnIndex === seatIndex && table.phase !== "waiting";
                const isEmpty = !seat;
                return (
                  <div key={`seat-${seatIndex}`} className={pos}>
                    <div
                      className={clsx(
                        "seat__card",
                        isEmpty && "seat__card--empty",
                        seat?.status === "folded" && "seat__card--folded",
                        isTurn && "seat__card--turn",
                        winningSeatSet.has(seatIndex) && "seat__card--winner"
                      )}
                    >
                      <div className="seat__header">
                        {seat ? (
                          <div className="seat__avatar" aria-hidden="true">
                            <img src={seat.avatarUrl || defaultAvatarAsset} alt="" />
                          </div>
                        ) : null}
                        <span className="seat__name text-xs font-semibold text-white">
                          {seat ? (seat.isYou ? "You" : seat.username ?? "Player") : "Empty"}
                        </span>
                        <span aria-hidden="true" />
                      </div>
                      {seat && (
                        <>
                          <div className="seat__stack">{usd.format(seat.stackCents / 100)}</div>
                          <div className="seat__status">
                            {seat.status === "folded" && "Folded"}
                            {seat.status === "out" && "Out"}
                            {seat.status === "allin" && "All-in"}
                          </div>
                          <div className="seat__bet">
                            {seat.betCents > 0 ? `Bet ${usd.format(seat.betCents / 100)}` : ""}
                          </div>
                          <div className="seat__cards">
                            {seat.hand.length > 0
                              ? seat.hand.map((card, cIdx) => (
                                  <PlayingCard key={`seat-${seatIndex}-${cIdx}`} card={card} size="sm" />
                                ))
                              : lastRoundSeatHands.get(seatIndex)?.length
                                ? lastRoundSeatHands.get(seatIndex)?.map((card, cIdx) => (
                                    <PlayingCard key={`seat-last-${seatIndex}-${cIdx}`} card={card} size="sm" />
                                  ))
                                : seat.status !== "out" && table.phase !== "waiting"
                                  ? (
                                      <>
                                        <PlayingCard hidden size="sm" />
                                        <PlayingCard hidden size="sm" />
                                      </>
                                    )
                                  : null}
                          </div>
                          {seat.lastAction && <div className="seat__action">{seat.lastAction}</div>}
                          {lastRoundLeft > 0 && lastRoundSeatLabels.get(seatIndex) && (
                            <div className="seat__result">{lastRoundSeatLabels.get(seatIndex)}</div>
                          )}
                          {lastRoundLeft > 0 && lastRoundSeatNet.has(seatIndex) && (
                            <div
                              className={clsx(
                                "seat__net",
                                lastRoundSeatNet.get(seatIndex)! > 0 && "seat__net--win",
                                lastRoundSeatNet.get(seatIndex)! < 0 && "seat__net--loss"
                              )}
                            >
                              Win/Loss {formatNetCents(lastRoundSeatNet.get(seatIndex) ?? 0)}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {error}
              </div>
            )}

            {isMyTurn && table && (
              <div className="mt-6 rounded-xl border border-white/10 bg-slate-900/70 p-4 text-center">
                <div className="text-xs uppercase tracking-wide text-slate-400">Your turn</div>
                <div className="mt-1 text-sm text-slate-200">
                  Time left until auto check/fold:{" "}
                  <span className="font-semibold text-white">{timeLeft}s</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => act(canCheck ? "check" : "call")}
                    disabled={busy}
                    className="rounded-lg border border-white/20 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-white/60"
                  >
                    {canCheck ? "Check" : `Call ${usd.format(callAmountCents / 100)}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => act("fold")}
                    disabled={busy}
                    className="rounded-lg border border-white/20 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-white/60"
                  >
                    Fold
                  </button>
                  <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2">
                    <span className="text-xs text-slate-400">Raise to</span>
                    <input
                      type="number"
                      min={minRaiseCents / 100}
                      step={1}
                      value={raiseTo}
                      onChange={(e) => setRaiseTo(e.target.value)}
                      className="w-24 rounded border border-white/20 bg-slate-950/60 px-2 py-1 text-xs text-white focus:border-[#5c7cfa] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => act("raise")}
                      disabled={busy || !raiseTo}
                      className="rounded-md bg-[#c5305f] px-3 py-1 text-xs font-semibold text-white transition hover:bg-[#a61a42] disabled:opacity-40"
                    >
                      Raise
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  Minimum raise: {usd.format(minRaiseCents / 100)}
                </div>
              </div>
            )}
          </section>
        )}

      {loading && !status && (
        <div className="text-xs text-slate-400">Loading poker table…</div>
      )}

      {leaveConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-950/95 p-6 text-left shadow-2xl">
            <div className="text-lg font-semibold text-white">Leave table?</div>
            <p className="mt-2 text-sm text-slate-300">
              Are you sure you want to leave? Your current hand will be folded.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setLeaveConfirmOpen(false)}
                className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/60"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={confirmLeave}
                disabled={busy}
                className="rounded-xl bg-[#c5305f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a61a42] disabled:cursor-not-allowed disabled:bg-[#c5305f]/50"
              >
                Leave table
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      <style jsx>{`
        .poker-table {
          position: relative;
          width: 100%;
          max-width: 740px;
          margin: 0 auto;
          aspect-ratio: 1 / 1;
          border-radius: 999px;
        }
        .poker-table__felt {
          position: relative;
          border-radius: 999px;
          background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.08), transparent 60%),
            linear-gradient(135deg, #0b3b1c, #0f2f1c);
          border: 2px solid rgba(255, 255, 255, 0.12);
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
          box-shadow: inset 0 0 35px rgba(0, 0, 0, 0.5);
        }
        .poker-table__center {
          text-align: center;
        }
        .seat {
          position: absolute;
          width: 173px;
        }
        .seat--top {
          top: -28px;
          left: 50%;
          transform: translateX(-50%);
        }
        .seat--top-right {
          top: 90px;
          right: -60px;
        }
        .seat--bottom-right {
          bottom: 90px;
          right: -60px;
        }
        .seat--bottom {
          bottom: -6px;
          left: 50%;
          transform: translateX(-50%);
        }
        .seat--bottom-left {
          bottom: 90px;
          left: -60px;
        }
        .seat--top-left {
          top: 90px;
          left: -60px;
        }
        .seat__card {
          border-radius: 1rem;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(15, 23, 42, 0.75);
          padding: 0.65rem;
          text-align: center;
          color: #e2e8f0;
          min-height: 140px;
          display: flex;
          flex-direction: column;
          gap: 0.38rem;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
        }
        .seat__card--empty {
          opacity: 0.4;
        }
        .seat__card--folded {
          opacity: 0.6;
        }
        .seat__card--turn {
          border-color: rgba(92, 124, 250, 0.7);
          box-shadow: 0 0 0 2px rgba(92, 124, 250, 0.2);
        }
        .seat__card--winner {
          border-color: rgba(34, 197, 94, 0.9);
          box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.25), 0 6px 18px rgba(0, 0, 0, 0.4);
        }
        .seat__header {
          display: grid;
          grid-template-columns: 30px 1fr 30px;
          align-items: center;
          gap: 0.38rem;
        }
        .seat__name {
          text-align: center;
        }
        .seat__avatar {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.25);
          background: rgba(15, 23, 42, 0.7);
        }
        .seat__avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .poker-winner {
          border: 1px solid rgba(34, 197, 94, 0.6);
          background: rgba(22, 163, 74, 0.15);
          border-radius: 0.75rem;
          padding: 0.5rem 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          width: 100%;
        }
        .poker-winner__name,
        .poker-compare__label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          width: 100%;
          font-size: 0.75rem;
          color: #ecfeff;
        }
        .poker-winner__tag {
          font-size: 0.65rem;
          padding: 0.1rem 0.4rem;
          border-radius: 999px;
          background: rgba(16, 185, 129, 0.3);
          color: #bbf7d0;
        }
        .poker-winner__hand {
          display: flex;
          gap: 0.35rem;
          justify-content: center;
        }
        .poker-results-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          justify-content: center;
          align-items: flex-start;
          --result-card-width: 220px;
        }
        .poker-results-row__winners {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          align-items: center;
          width: var(--result-card-width);
        }
        .poker-compare {
          border: 1px solid rgba(16, 185, 129, 0.25);
          background: rgba(15, 118, 110, 0.12);
          border-radius: 0.75rem;
          padding: 0.5rem 0.75rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.4rem;
          width: var(--result-card-width);
        }
        .poker-compare--loss {
          border-color: rgba(248, 113, 113, 0.5);
          background: rgba(220, 38, 38, 0.18);
        }
        .poker-compare__tag {
          font-size: 0.65rem;
          padding: 0.1rem 0.4rem;
          border-radius: 999px;
          background: rgba(248, 113, 113, 0.25);
          color: #fee2e2;
          white-space: nowrap;
        }
        .poker-compare__hand {
          display: flex;
          gap: 0.35rem;
          justify-content: center;
        }
        .seat__dealer {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: #facc15;
          color: #111827;
          font-size: 0.65rem;
          font-weight: 700;
        }
        .seat__stack {
          font-size: 0.82rem;
          color: #e2e8f0;
        }
        .seat__status,
        .seat__bet {
          font-size: 0.76rem;
          color: rgba(148, 163, 184, 0.9);
        }
        .seat__cards {
          display: flex;
          justify-content: center;
          gap: 0.38rem;
        }
        .seat__action {
          font-size: 0.76rem;
          color: rgba(226, 232, 240, 0.9);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .seat__result {
          font-size: 0.7rem;
          color: rgba(226, 232, 240, 0.85);
        }
        .seat__net {
          font-size: 0.7rem;
          color: rgba(226, 232, 240, 0.85);
        }
        .seat__net--win {
          color: #86efac;
        }
        .seat__net--loss {
          color: #fca5a5;
        }
        .playing-card {
          position: relative;
          border-radius: 0.6rem;
          border: 1px solid rgba(15, 23, 42, 0.15);
          background: #fff;
          color: white;
          overflow: hidden;
          box-shadow: none;
        }
        .playing-card--back {
          background: #fff;
        }
        .playing-card__pattern {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle, rgba(255, 255, 255, 0.08) 20%, transparent 20%);
          background-size: 12px 12px;
          filter: saturate(0.2);
        }
        .playing-card__corner {
          position: absolute;
          display: flex;
          flex-direction: column;
          font-size: 0.7rem;
          font-weight: 600;
          text-align: center;
          letter-spacing: 0.05em;
        }
        .playing-card__corner--top {
          top: 6px;
          left: 8px;
          align-items: flex-start;
        }
        .playing-card__corner--bottom {
          bottom: 6px;
          right: 8px;
          align-items: flex-end;
          transform: rotate(180deg);
        }
        .playing-card__center {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
        }
        .playing-card__image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          padding: 0;
          box-sizing: border-box;
          border-radius: 0.5rem;
        }
      `}</style>
    </DashboardShell>
  );
}
