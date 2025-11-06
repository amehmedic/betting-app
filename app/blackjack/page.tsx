"use client";
import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import type {
  BlackjackAction,
  DealerAction,
  Card,
  BlackjackResult,
} from "@/lib/blackjack";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

type WalletView = {
  balance: string;
  held: string;
};

type GamePhase = "idle" | "player" | "finished";

type GameView = {
  phase: GamePhase;
  gameId?: string;
  bet?: number;
  dealerRevealed: boolean;
  playerHand: Card[];
  dealerHand: Card[];
  playerTotal: number;
  dealerTotal: number;
  playerBust: boolean;
  dealerBust: boolean;
  playerBlackjack: boolean;
  dealerBlackjack: boolean;
  playerActions: BlackjackAction[];
  dealerActions: DealerAction[];
  result?: BlackjackResult;
};

type BlackjackStateResponse = {
  ok: boolean;
  state: "player" | "finished";
  dealerRevealed: boolean;
  gameId?: string;
  bet?: number;
  playerHand: Card[];
  dealerHand: Card[];
  playerActions: BlackjackAction[];
  dealerActions: DealerAction[];
  playerTotal: number;
  dealerTotal: number;
  playerBust: boolean;
  dealerBust: boolean;
  playerBlackjack: boolean;
  dealerBlackjack: boolean;
  result?: BlackjackResult;
  wallet?: WalletView;
};

const suitCode: Record<Card["suit"], string> = {
  clubs: "C",
  diamonds: "D",
  hearts: "H",
  spades: "S",
};

const initialGame: GameView = {
  phase: "idle",
  dealerRevealed: false,
  playerHand: [],
  dealerHand: [],
  playerTotal: 0,
  dealerTotal: 0,
  playerBust: false,
  dealerBust: false,
  playerBlackjack: false,
  dealerBlackjack: false,
  playerActions: [],
  dealerActions: [],
};

function formatCard(card: Card) {
  return `${card.rank}${suitCode[card.suit]}`;
}

function formatWalletAmount(value: string) {
  return usd.format(Number(value) / 100);
}

function notifyWalletUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("wallet:update"));
  }
}

function toGameView(payload: BlackjackStateResponse): GameView {
  const phase: GamePhase = payload.state === "player" ? "player" : "finished";

  return {
    phase,
    gameId: payload.gameId ?? undefined,
    bet: payload.bet,
    dealerRevealed: payload.dealerRevealed ?? phase === "finished",
    playerHand: payload.playerHand ?? [],
    dealerHand: payload.dealerHand ?? [],
    playerTotal: payload.playerTotal ?? 0,
    dealerTotal: payload.dealerTotal ?? 0,
    playerBust: payload.playerBust ?? false,
    dealerBust: payload.dealerBust ?? false,
    playerBlackjack: payload.playerBlackjack ?? false,
    dealerBlackjack: payload.dealerBlackjack ?? false,
    playerActions: payload.playerActions ?? [],
    dealerActions: payload.dealerActions ?? [],
    result: payload.result,
  };
}

export default function BlackjackPage() {
  const [amount, setAmount] = useState("5.00");
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [game, setGame] = useState<GameView>(initialGame);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountValue = amount === "" ? NaN : Number(amount);
  const amountValid = Number.isFinite(amountValue) && amountValue >= 0.01;

  useEffect(() => {
    void resumeGame();
  }, []);

  async function resumeGame() {
    try {
      const res = await fetch("/api/games/blackjack/current", {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) {
        return;
      }
      const json = (await res.json()) as
        | (BlackjackStateResponse & { ok: true; active: true; wallet?: WalletView })
        | { ok: true; active: false; wallet?: WalletView };
      if ("active" in json && json.active) {
        setGame(toGameView(json));
        if (json.wallet) {
          setWallet(json.wallet);
          notifyWalletUpdate();
        }
      } else if ("wallet" in json && json.wallet) {
        setWallet(json.wallet);
        notifyWalletUpdate();
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function startGame() {
    if (!amountValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/games/blackjack/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amountValue.toFixed(2)) }),
      });
      const json = (await res.json().catch(() => ({}))) as
        | BlackjackStateResponse
        | { error?: string };
      if (!res.ok || !json || (json as any).ok !== true) {
        setError((json as any)?.error ?? "Failed to start blackjack");
        return;
      }
      setGame(toGameView(json as BlackjackStateResponse));
      if ((json as BlackjackStateResponse).wallet) {
        setWallet((json as BlackjackStateResponse).wallet ?? null);
        notifyWalletUpdate();
      }
    } catch (e) {
      console.error(e);
      setError("Failed to start blackjack");
    } finally {
      setBusy(false);
    }
  }

  async function hit() {
    if (!game.gameId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/games/blackjack/hit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.gameId }),
      });
      const json = (await res.json().catch(() => ({}))) as
        | BlackjackStateResponse
        | { error?: string };
      if (!res.ok || !json || (json as any).ok !== true) {
        setError((json as any)?.error ?? "Hit failed");
        return;
      }
      setGame(toGameView(json as BlackjackStateResponse));
      if ((json as BlackjackStateResponse).wallet) {
        setWallet((json as BlackjackStateResponse).wallet ?? null);
        notifyWalletUpdate();
      }
    } catch (e) {
      console.error(e);
      setError("Hit failed");
    } finally {
      setBusy(false);
    }
  }

  async function stand() {
    if (!game.gameId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/games/blackjack/stand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.gameId }),
      });
      const json = (await res.json().catch(() => ({}))) as
        | BlackjackStateResponse
        | { error?: string };
      if (!res.ok || !json || (json as any).ok !== true) {
        setError((json as any)?.error ?? "Stand failed");
        return;
      }
      setGame(toGameView(json as BlackjackStateResponse));
      if ((json as BlackjackStateResponse).wallet) {
        setWallet((json as BlackjackStateResponse).wallet ?? null);
        notifyWalletUpdate();
      }
    } catch (e) {
      console.error(e);
      setError("Stand failed");
    } finally {
      setBusy(false);
    }
  }

  const canAct = game.phase === "player" && !!game.gameId && !busy;
  const canDeal = !busy && game.phase !== "player";
  const dealerDisplayTotal = game.dealerRevealed ? game.dealerTotal : "--";

  return (
    <DashboardShell
      title="Blackjack"
      description="Deal a hand, play it out in real time, and settle automatically when the dealer stands."
    >
      <div className="space-y-6">
        <section className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <label className="text-xs uppercase tracking-wide text-slate-400">Bet (USD)</label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                disabled={!canDeal}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-28 rounded border border-white/20 bg-slate-900/60 px-3 py-1 text-sm text-white focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 disabled:cursor-not-allowed disabled:text-slate-500"
              />
              <span className="text-xs text-slate-400">
                {amountValid ? usd.format(amountValue) : "Enter amount"}
              </span>
            </div>

            <button
              onClick={startGame}
              disabled={!canDeal || !amountValid}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
            >
              {busy && game.phase !== "player" ? "Dealing..." : "Deal"}
            </button>

            <div className="ml-auto text-sm text-slate-300">
              <div>Balance: {wallet ? formatWalletAmount(wallet.balance) : "-"}</div>
              <div>Held: {wallet ? formatWalletAmount(wallet.held) : "-"}</div>
            </div>
          </div>

          {game.phase === "player" && (
            <div className="flex gap-3">
              <button
                onClick={hit}
                disabled={!canAct}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:text-slate-500"
              >
                {busy ? "..." : "Hit"}
              </button>
              <button
                onClick={stand}
                disabled={!canAct}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
              >
                {busy ? "..." : "Stand"}
              </button>
            </div>
          )}

          {error && <div className="text-sm text-red-400">{error}</div>}
        </section>

        {game.phase !== "idle" && (
          <section className="space-y-4 rounded-xl border border-white/10 bg-slate-900/60 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Round status</div>
                <div className="text-2xl font-semibold text-white">
                  {game.phase === "player" && "Your turn"}
                  {game.phase === "finished" &&
                    (game.result === "win"
                      ? "You win!"
                      : game.result === "push"
                      ? "Push"
                      : "Dealer wins")}
                  {game.phase === "finished" && game.result === undefined && "Resolved"}
                </div>
                {typeof game.bet === "number" && (
                  <div className="text-sm text-slate-300">Bet: {usd.format(game.bet)}</div>
                )}
              </div>
              <div className="text-right text-xs uppercase tracking-wide text-slate-400">
                <div>Player actions: {game.playerActions.join(", ") || "-"}</div>
                <div>Dealer actions: {game.dealerActions.join(", ") || "-"}</div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                  Player
                </h2>
                <div className="mb-2 text-sm text-slate-400">
                  Total {game.playerTotal}
                  {game.playerBlackjack ? " (blackjack)" : ""}
                  {game.playerBust ? " (bust)" : ""}
                </div>
                <div className="flex flex-wrap gap-2 font-mono text-sm text-white">
                  {game.playerHand.map((card, idx) => (
                    <span
                      key={`player-${idx}`}
                      className="rounded bg-slate-950/70 px-2 py-1 shadow shadow-black/20"
                    >
                      {formatCard(card)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                  Dealer
                </h2>
                <div className="mb-2 text-sm text-slate-400">
                  Total {dealerDisplayTotal}
                  {game.dealerBlackjack && game.dealerRevealed ? " (blackjack)" : ""}
                  {game.dealerBust && game.dealerRevealed ? " (bust)" : ""}
                </div>
                <div className="flex flex-wrap gap-2 font-mono text-sm text-white">
                  {game.dealerHand.map((card, idx) => {
                    if (!game.dealerRevealed && idx === 1) {
                      return (
                        <span
                          key={`dealer-${idx}`}
                          className="rounded bg-slate-800/70 px-2 py-1 shadow shadow-black/20"
                        >
                          ??
                        </span>
                      );
                    }
                    return (
                      <span
                        key={`dealer-${idx}`}
                        className="rounded bg-slate-950/70 px-2 py-1 shadow shadow-black/20"
                      >
                        {formatCard(card)}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
