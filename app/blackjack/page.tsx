"use client";
import { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import type {
  BlackjackAction,
  DealerAction,
  Card,
  BlackjackResult,
} from "@/lib/blackjack";
import clsx from "clsx";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

type WalletView = {
  balance: string;
  held: string;
};

type GamePhase = "idle" | "player" | "finished";

type HandView = {
  cards: Card[];
  total: number;
  bust: boolean;
  blackjack: boolean;
  result?: BlackjackResult;
  bet?: number;
};

type GameView = {
  phase: GamePhase;
  gameId?: string;
  bet?: number;
  dealerRevealed: boolean;
  handBets: number[];
  playerHands: HandView[];
  dealerHand: Card[];
  activeHand: number;
  dealerTotal: number;
  dealerBust: boolean;
  dealerBlackjack: boolean;
  playerActions: BlackjackAction[][];
  dealerActions: DealerAction[];
  result?: BlackjackResult;
};

type BlackjackStateResponse = {
  ok: boolean;
  state: "player" | "finished";
  dealerRevealed: boolean;
  gameId?: string;
  bet?: number;
  handBets: number[];
  activeHand: number;
  playerHands: Card[][];
  dealerHand: Card[];
  playerActions: BlackjackAction[][];
  dealerActions: DealerAction[];
  playerTotals: number[];
  dealerTotal: number;
  playerBusts: boolean[];
  dealerBust: boolean;
  playerBlackjacks: boolean[];
  dealerBlackjack: boolean;
  handResults?: BlackjackResult[];
  result?: BlackjackResult;
  wallet?: WalletView;
};

const suitCode: Record<Card["suit"], string> = {
  clubs: "C",
  diamonds: "D",
  hearts: "H",
  spades: "S",
};

const suitMeta: Record<
  Card["suit"],
  { symbol: string; color: string; gradient: string }
> = {
  clubs: { symbol: "♣", color: "#86efac", gradient: "linear-gradient(135deg,#0f172a,#172341)" },
  spades: { symbol: "♠", color: "#cbd5f5", gradient: "linear-gradient(135deg,#111827,#1f2937)" },
  hearts: { symbol: "♥", color: "#f472b6", gradient: "linear-gradient(135deg,#2a0d1c,#3f1226)" },
  diamonds: { symbol: "♦", color: "#fb7185", gradient: "linear-gradient(135deg,#2a0d1c,#401123)" },
};

const CARD_ANIM_DELAY = 120;
const CARD_WIDTH = 100;
const CARD_HEIGHT = 150;
const faceDownAsset = "/cards/FACE-DOWN.svg";

const initialGame: GameView = {
  phase: "idle",
  dealerRevealed: false,
  handBets: [],
  playerHands: [],
  dealerHand: [],
  dealerTotal: 0,
  dealerBust: false,
  dealerBlackjack: false,
  playerActions: [],
  dealerActions: [],
  activeHand: 0,
};

function formatCard(card: Card) {
  return `${card.rank}${suitCode[card.suit]}`;
}

const suitFileMap: Record<Card["suit"], string> = {
  spades: "SPADE",
  hearts: "HEART",
  diamonds: "DIAMOND",
  clubs: "CLUB",
};

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
  delay = 0,
  owner,
}: {
  card?: Card;
  hidden?: boolean;
  delay?: number;
  owner: "player" | "dealer";
}) {
  if (hidden) {
    return (
      <div
        className={clsx("playing-card playing-card--back", {
          "playing-card--player": owner === "player",
          "playing-card--dealer": owner === "dealer",
        })}
        style={{
          animationDelay: `${delay}ms`,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
        }}
        aria-label="Hidden card"
      >
        {faceDownAsset ? (
          <img
            src={faceDownAsset}
            alt="Face down card"
            loading="lazy"
            decoding="async"
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
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
    <div
      className={clsx("playing-card playing-card--front", {
        "playing-card--player": owner === "player",
        "playing-card--dealer": owner === "dealer",
      })}
      style={{
        animationDelay: `${delay}ms`,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
      }}
      aria-label={formatCard(card)}
    >
        {asset ? (
          <img
            src={asset}
            alt={formatCard(card)}
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
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
  const playerHands: HandView[] = (payload.playerHands ?? []).map((cards, idx) => ({
    cards,
    total: payload.playerTotals?.[idx] ?? 0,
    bust: payload.playerBusts?.[idx] ?? false,
    blackjack: payload.playerBlackjacks?.[idx] ?? false,
    result: payload.handResults?.[idx],
    bet: payload.handBets?.[idx],
  }));

  return {
    phase,
    gameId: payload.gameId ?? undefined,
    bet: payload.bet,
    dealerRevealed: payload.dealerRevealed ?? phase === "finished",
    handBets: payload.handBets ?? [],
    playerHands,
    dealerHand: payload.dealerHand ?? [],
    dealerTotal: payload.dealerTotal ?? 0,
    dealerBust: payload.dealerBust ?? false,
    dealerBlackjack: payload.dealerBlackjack ?? false,
    activeHand: payload.activeHand ?? 0,
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

  async function doubleDown() {
    if (!game.gameId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/games/blackjack/double-down", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.gameId }),
      });
      const json = (await res.json().catch(() => ({}))) as BlackjackStateResponse | { error?: string };
      if (!res.ok || !json || (json as any).ok !== true) {
        setError((json as any)?.error ?? "Double down failed");
        return;
      }
      setGame(toGameView(json as BlackjackStateResponse));
      if ((json as BlackjackStateResponse).wallet) {
        setWallet((json as BlackjackStateResponse).wallet ?? null);
        notifyWalletUpdate();
      }
    } catch (e) {
      console.error(e);
      setError("Double down failed");
    } finally {
      setBusy(false);
    }
  }

  async function split() {
    if (!game.gameId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/games/blackjack/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.gameId }),
      });
      const json = (await res.json().catch(() => ({}))) as BlackjackStateResponse | { error?: string };
      if (!res.ok || !json || (json as any).ok !== true) {
        setError((json as any)?.error ?? "Split failed");
        return;
      }
      setGame(toGameView(json as BlackjackStateResponse));
      if ((json as BlackjackStateResponse).wallet) {
        setWallet((json as BlackjackStateResponse).wallet ?? null);
        notifyWalletUpdate();
      }
    } catch (e) {
      console.error(e);
      setError("Split failed");
    } finally {
      setBusy(false);
    }
  }

  const canAct = game.phase === "player" && !!game.gameId && !busy;
  const canDeal = !busy && game.phase !== "player";
  const dealerDisplayTotal = game.dealerRevealed ? game.dealerTotal : "--";
  const playerTotalText =
    game.playerHands.length > 0 ? game.playerHands.map((h) => h.total).join(" / ") : "--";
  const dealerTotalText =
    typeof game.dealerTotal === "number" ? game.dealerTotal : dealerDisplayTotal;
  const currentHand = game.playerHands[game.activeHand] ?? null;
  const resultTone =
    game.phase === "finished"
      ? game.result === "win"
        ? "win"
        : game.result === "loss"
        ? "loss"
        : "push"
      : null;
  const resultMessage =
    resultTone === "win"
      ? `You win ${game.bet ? usd.format(game.bet) : ""}! (${playerTotalText} vs ${dealerTotalText})`
      : resultTone === "loss"
      ? `Dealer wins (${dealerTotalText} vs ${playerTotalText}).`
      : resultTone === "push"
      ? `Push — both sides at ${playerTotalText}.`
      : "";
  const activeActions = game.playerActions[game.activeHand] ?? [];
  const canDoubleDown =
    !busy &&
    game.phase === "player" &&
    (currentHand?.cards?.length ?? 0) === 2 &&
    !activeActions.includes("double") &&
    !activeActions.includes("hit");
  const baseHandBetCents = Math.round((game.handBets?.[game.activeHand] ?? 0) * 100);
  const walletBalanceCents = wallet ? Number(wallet.balance) : 0;
  const canSplit =
    !busy &&
    game.phase === "player" &&
    game.playerHands.length === 1 &&
    (currentHand?.cards?.length ?? 0) === 2 &&
    walletBalanceCents >= baseHandBetCents &&
    (() => {
      if (!currentHand) return false;
      const [a, b] = currentHand.cards;
      if (!a || !b) return false;
      return a.rank === b.rank;
    })();
  const playerActionsSummary =
    game.playerActions.length > 0
      ? game.playerActions
          .map((acts, idx) => `H${idx + 1}: ${acts.join(" / ") || "-"}`)
          .join(" | ")
      : "-";

  return (
    <DashboardShell title="" description="">
      <div className="mx-auto max-w-5xl space-y-8 text-center">
        <div>
          <h1 className="text-3xl font-semibold text-white">Blackjack</h1>
        </div>

        <section className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 text-left shadow-xl shadow-black/30">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex flex-col items-center gap-2">
              <label className="text-xs uppercase tracking-wide text-slate-400">Bet amount (USD)</label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                disabled={!canDeal}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-32 rounded border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30 disabled:cursor-not-allowed disabled:text-slate-500"
              />
              <span className="text-xs text-slate-400">
                {amountValid ? usd.format(amountValue) : "Enter amount"}
              </span>
            </div>

            <div className="flex flex-col items-center gap-4 w-full max-w-sm">
              <button
                onClick={startGame}
                disabled={!canDeal || !amountValid}
                className="w-full rounded-xl bg-[#c5305f] px-6 py-3 text-lg font-semibold text-white transition hover:bg-[#a61a42] disabled:cursor-not-allowed disabled:bg-[#c5305f]/50"
              >
                {game.phase === "player" ? "Hand in progress" : busy ? "Dealing..." : "Deal cards"}
              </button>
              {game.phase === "player" && (
                <>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      onClick={hit}
                      disabled={!canAct}
                      className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-[#5c7cfa] hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                    >
                      {busy ? "..." : "Hit"}
                    </button>
                    <button
                      onClick={stand}
                      disabled={!canAct}
                      className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-[#5c7cfa] hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                    >
                      {busy ? "..." : "Stand"}
                    </button>
                    <button
                      onClick={doubleDown}
                      disabled={!canDoubleDown}
                      title="Double down is available only before you hit."
                      className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-[#c5305f] hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                    >
                      Double Down
                    </button>
                    <button
                      onClick={split}
                      disabled={!canSplit}
                      title="Split matching pairs into two hands."
                      className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-[#5c7cfa] hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                    >
                      Split
                    </button>
                  </div>
                </>
              )}
            </div>

          </div>

          {error && <div className="text-sm text-red-400">{error}</div>}
        </section>

        {game.phase !== "idle" && (
          <section className="space-y-4 rounded-3xl border border-white/10 bg-slate-900/60 p-6 text-left shadow-2xl shadow-black/40">
            <div className="flex flex-col items-center gap-4 text-center md:flex-row md:items-start md:justify-between md:text-left">
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
              <div className="text-xs uppercase tracking-wide text-slate-400 md:text-right">
                <div>Player actions: {playerActionsSummary}</div>
                <div>Dealer actions: {game.dealerActions.join(", ") || "-"}</div>
              </div>
            </div>
            {resultTone && (
              <div
                className={clsx(
                  "rounded-xl border p-4 text-sm font-medium text-center transition",
                  resultTone === "win"
                    ? "border-[#5c7cfa] bg-[#5c7cfa]/15 text-[#dfe6ff]"
                    : resultTone === "loss"
                    ? "border-rose-500/70 bg-rose-500/15 text-rose-100"
                    : "border-slate-500/40 bg-slate-800/40 text-slate-200"
                )}
              >
                {resultMessage}
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300 text-center md:text-left">
                  Player
                </h2>
                <div className="mb-2 text-sm text-slate-400 text-center md:text-left">
                  {game.playerHands.length > 0
                    ? game.playerHands
                        .map(
                          (hand, idx) =>
                            `Hand ${idx + 1}: ${hand.total}${
                              hand.blackjack ? " (blackjack)" : ""
                            }${hand.bust ? " (bust)" : ""}${hand.result ? ` · ${hand.result}` : ""}`
                        )
                        .join(" • ")
                    : "No cards"}
                </div>
                {game.playerHands.length <= 1 ? (
                  <div className="hand-grid">
                    {game.playerHands[0]?.cards.map((card, idx) => (
                      <PlayingCard
                        key={`player-0-${idx}`}
                        card={card}
                        delay={idx * CARD_ANIM_DELAY}
                        owner="player"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="hand-grid hand-grid--columns">
                    {game.playerHands.map((hand, handIdx) => (
                      <div
                        key={`player-hand-${handIdx}`}
                        className={clsx("hand-column", {
                          "hand-column--active":
                            game.phase === "player" &&
                            game.activeHand === handIdx &&
                            game.playerHands.length > 1,
                        })}
                      >
                        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400 mb-2">
                          <span>
                            Hand {handIdx + 1} {hand.bet ? `· Bet ${usd.format(hand.bet)}` : ""}
                          </span>
                          <span>
                            Total {hand.total}
                            {hand.blackjack ? " (blackjack)" : ""}
                            {hand.bust ? " (bust)" : ""}
                            {hand.result ? ` · ${hand.result}` : ""}
                          </span>
                        </div>
                        <div className="hand-grid">
                          {hand.cards.map((card, idx) => (
                            <PlayingCard
                              key={`player-${handIdx}-${idx}`}
                              card={card}
                              delay={idx * CARD_ANIM_DELAY}
                              owner="player"
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300 text-center md:text-left">
                  Dealer
                </h2>
                <div className="mb-2 text-sm text-slate-400 text-center md:text-left">
                  Total {dealerDisplayTotal}
                  {game.dealerBlackjack && game.dealerRevealed ? " (blackjack)" : ""}
                  {game.dealerBust && game.dealerRevealed ? " (bust)" : ""}
                </div>
                <div className="hand-grid">
                  {game.dealerHand.map((card, idx) => {
                    const hidden = !game.dealerRevealed && idx === 1;
                    return (
                      <PlayingCard
                        key={`dealer-${idx}`}
                        card={hidden ? undefined : card}
                        hidden={hidden}
                        delay={idx * CARD_ANIM_DELAY}
                        owner="dealer"
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
      <style jsx>{`
        .hand-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          justify-content: flex-start;
        }
        .hand-grid--columns {
          gap: 1rem;
        }
        .hand-column {
          flex: 1 1 220px;
          border: 1px dashed rgba(255, 255, 255, 0.08);
          border-radius: 0.75rem;
          padding: 0.75rem;
          background: rgba(15, 23, 42, 0.2);
        }
        .hand-column--active {
          border-color: #5c7cfa;
          box-shadow: 0 0 0 1px rgba(92, 124, 250, 0.35);
        }
        .playing-card {
          position: relative;
          border-radius: 0.6rem;
          border: 1px solid rgba(15, 23, 42, 0.15);
          background: #fff;
          color: white;
          font-family: "Space Grotesk", ui-sans-serif, system-ui;
          animation-duration: 0.65s;
          animation-fill-mode: forwards;
          animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
          transform: rotate(-2deg);
          opacity: 0;
          overflow: hidden;
          box-shadow: none;
        }
        .playing-card--front {
          background: #fff;
        }
        .playing-card--back {
          background: #fff;
          overflow: hidden;
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
          font-size: 0.8rem;
          font-weight: 600;
          text-align: center;
          letter-spacing: 0.05em;
        }
        .playing-card__corner--top {
          top: 8px;
          left: 10px;
          align-items: flex-start;
        }
        .playing-card__corner--bottom {
          bottom: 8px;
          right: 10px;
          align-items: flex-end;
          transform: rotate(180deg);
        }
        .playing-card__center {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
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
        .playing-card__pip-cluster {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .playing-card__pip {
          position: absolute;
          width: 22px;
          height: 22px;
          display: block;
        }
        .playing-card__pip::before,
        .playing-card__pip::after {
          content: "";
          position: absolute;
          inset: 0;
        }
        .playing-card__pip--hearts::before,
        .playing-card__pip--hearts::after {
          width: 12px;
          height: 16px;
          border-radius: 12px 12px 0 0;
          background: currentColor;
        }
        .playing-card__pip--hearts::before {
          left: 2px;
          transform: rotate(-45deg);
          transform-origin: 6px 10px;
        }
        .playing-card__pip--hearts::after {
          right: 2px;
          transform: rotate(45deg);
          transform-origin: 6px 10px;
        }
        .playing-card__pip--diamonds::before {
          width: 16px;
          height: 16px;
          left: 3px;
          top: 3px;
          background: currentColor;
          transform: rotate(45deg);
          border-radius: 4px;
        }
        .playing-card__pip--spades::before,
        .playing-card__pip--clubs::before {
          content: "♠";
          position: absolute;
          inset: 0;
          font-size: 1.5rem;
          color: currentColor;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .playing-card__pip--clubs::before {
          content: "♣";
        }
        .playing-card__pip--spades::after,
        .playing-card__pip--clubs::after,
        .playing-card__pip--diamonds::after {
          display: none;
        }
        .playing-card__pip--top-left {
          top: 18px;
          left: 16px;
        }
        .playing-card__pip--top-right {
          top: 18px;
          right: 16px;
        }
        .playing-card__pip--center {
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
        .playing-card__pip--bottom-left {
          bottom: 18px;
          left: 16px;
        }
        .playing-card__pip--bottom-right {
          bottom: 18px;
          right: 16px;
        }
        .playing-card--player {
          animation-name: deal-player;
        }
        .playing-card--dealer {
          animation-name: deal-dealer;
        }
        @keyframes deal-player {
          0% {
            opacity: 0;
            transform: translate3d(-120px, -40px, 0) rotate(-25deg) scale(0.7);
          }
          60% {
            opacity: 1;
            transform: translate3d(15px, 10px, 0) rotate(3deg) scale(1.03);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
          }
        }
        @keyframes deal-dealer {
          0% {
            opacity: 0;
            transform: translate3d(120px, -60px, 0) rotate(25deg) scale(0.7);
          }
          60% {
            opacity: 1;
            transform: translate3d(-10px, 8px, 0) rotate(-2deg) scale(1.03);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
          }
        }
      `}</style>
    </DashboardShell>
  );
}
