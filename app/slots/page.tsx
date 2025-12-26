"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import DashboardShell from "@/components/DashboardShell";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const SPIN_DURATION_MS = 1600;
const REEL_SYMBOL_HEIGHT = 90;
const REEL_SPIN_CYCLE_MS = 420;
const SLOT_SYMBOLS = [
  { id: "BAR", label: "Bar", src: "/slots/Bar.svg" },
  { id: "BELL", label: "Bell", src: "/slots/Bell.svg" },
  { id: "CHERRY", label: "Cherry", src: "/slots/Cherry.svg" },
  { id: "DIAMOND", label: "Diamond", src: "/slots/Diamond.svg" },
  { id: "GRAPES", label: "Grapes", src: "/slots/Grapes.svg" },
  { id: "LEMON", label: "Lemon", src: "/slots/Lemon.svg" },
  { id: "ORANGE", label: "Orange", src: "/slots/Orange.svg" },
  { id: "SEVEN", label: "Seven", src: "/slots/Seven.svg" },
] as const;
const SLOT_SYMBOL_BY_ID = Object.fromEntries(SLOT_SYMBOLS.map((symbol) => [symbol.id, symbol]));
const SLOT_SYMBOL_INDEX = Object.fromEntries(
  SLOT_SYMBOLS.map((symbol, idx) => [symbol.id, idx])
);
const REEL_STRIP = [...SLOT_SYMBOLS, ...SLOT_SYMBOLS, ...SLOT_SYMBOLS];

function notifyWalletUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("wallet:update"));
  }
}

type SlotResult = {
  reels: string[];
  win: boolean;
  multiplier: number;
  payout: number;
  wallet?: { balance: string; held: string };
};

export default function SlotsPage() {
  const [amount, setAmount] = useState("5.00");
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [reels, setReels] = useState<string[]>(["BAR", "BAR", "BAR"]);
  const [msg, setMsg] = useState("");
  const [resultTone, setResultTone] = useState<"win" | "loss" | null>(null);
  const spinTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingResultRef = useRef<SlotResult | null>(null);

  const parsedAmount = amount === "" ? NaN : Number(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount >= 0.01;

  useEffect(() => {
    return () => {
      if (spinTimeout.current) clearTimeout(spinTimeout.current);
      pendingResultRef.current = null;
    };
  }, []);

  async function spin() {
    if (!amountValid) {
      alert("Enter at least $0.01 before spinning.");
      return;
    }

    if (spinTimeout.current) {
      clearTimeout(spinTimeout.current);
      spinTimeout.current = null;
    }
    pendingResultRef.current = null;

    setBusy(true);
    setSpinning(true);
    setMsg("");
    setResultTone(null);

    try {
      const res = await fetch("/api/games/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parsedAmount }),
      });

      const j = (await res.json().catch(() => ({}))) as SlotResult | { error?: string };
      if (!res.ok || !("reels" in j)) {
        setSpinning(false);
        setBusy(false);
        return alert((j as any)?.error ?? "Spin failed");
      }

      pendingResultRef.current = j as SlotResult;
      spinTimeout.current = setTimeout(() => {
        if (!pendingResultRef.current) return;
        const result = pendingResultRef.current;
        setReels(result.reels);
        setSpinning(false);
        const balanceCents =
          result.wallet && typeof result.wallet.balance === "string"
            ? Number(result.wallet.balance)
            : NaN;
        const labelList = result.reels.map((symbol) => SLOT_SYMBOL_BY_ID[symbol]?.label ?? symbol);
        setMsg(
          result.win
            ? `Hit ${labelList.join(" | ")}. Payout ${usd.format(result.payout)}.`
            : `Missed with ${labelList.join(" | ")}.`
        );
        setResultTone(result.win ? "win" : "loss");
        if (Number.isFinite(balanceCents)) {
          setMsg((prev) => `${prev} New balance ${usd.format(balanceCents / 100)}.`);
        }
        pendingResultRef.current = null;
        notifyWalletUpdate();
      }, SPIN_DURATION_MS);
    } catch (err) {
      console.error(err);
      setSpinning(false);
      alert("Spin failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardShell title="" description="">
      <div className="mx-auto max-w-4xl space-y-8 text-center">
        <div>
          <h1 className="text-3xl font-semibold text-white">Slots</h1>
        </div>

        <div className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
          <div>
            <h3 className="text-lg font-semibold text-white">Classic 3-Reel</h3>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Match 3 symbols to win.
            </p>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Bet amount (USD)</label>
            <div className="mt-2 flex flex-col items-center gap-3">
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-32 rounded border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-left focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/40"
              />
              <span className="text-xs text-slate-400">
                {amountValid ? usd.format(parsedAmount) : "Enter stake"}
              </span>
            </div>
          </div>
          <button
            onClick={spin}
            disabled={busy || spinning || !amountValid}
            className="w-full max-w-sm rounded-xl bg-[#c5305f] px-4 py-3 text-lg font-semibold tracking-wide text-white transition hover:bg-[#a61a42] disabled:cursor-not-allowed disabled:bg-[#c5305f]/50"
          >
            {spinning ? "Spinning..." : "Spin the reels"}
          </button>
        </div>

        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0a0414]/85 via-[#101e46]/70 to-[#230c1c]/85 p-8 text-center shadow-2xl shadow-black/40">
          <div className="flex justify-center">
            <div className="slot-machine" aria-live="polite">
              {reels.map((symbol, idx) => {
                const symbolIndex = SLOT_SYMBOL_INDEX[symbol] ?? 0;
                const targetOffset = (symbolIndex + SLOT_SYMBOLS.length) * REEL_SYMBOL_HEIGHT;
                const stripStyle = {
                  ["--reel-offset" as string]: `${targetOffset}px`,
                  ...(spinning
                    ? {
                        animationDuration: `${REEL_SPIN_CYCLE_MS + idx * 80}ms`,
                        animationDelay: `${idx * 90}ms`,
                      }
                    : {}),
                } as CSSProperties;
                return (
                  <div key={`${symbol}-${idx}`} className="slot-reel">
                    <div className="slot-window">
                      <div className={clsx("slot-strip", spinning && "slot-strip--spinning")} style={stripStyle}>
                        {REEL_STRIP.map((stripSymbol, stripIdx) => {
                          const stripMeta = SLOT_SYMBOL_BY_ID[stripSymbol.id];
                          return (
                            <div key={`${stripSymbol.id}-${stripIdx}`} className="slot-strip__symbol">
                              <div className="slot-symbol">
                                {stripMeta ? (
                                  <img
                                    src={stripMeta.src}
                                    alt={stripMeta.label}
                                    className="slot-symbol__img"
                                  />
                                ) : (
                                  <span className="slot-symbol__text">{stripSymbol.id}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-300">
            {spinning ? "Reels are spinning..." : "Match three symbols to score a payout."}
          </p>
          {msg && (
            <div
              className={clsx(
                "mt-4 rounded-xl border p-4 text-sm leading-relaxed",
                resultTone === "win"
                  ? "border-[#5c7cfa] bg-[#5c7cfa]/15 text-[#dfe6ff]"
                  : resultTone === "loss"
                  ? "border-rose-500/70 bg-rose-500/15 text-rose-100"
                  : "border-slate-500/40 bg-slate-800/40 text-slate-200"
              )}
            >
              {msg}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .slot-machine {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 18px;
        }

        .slot-reel {
          width: 120px;
          height: 140px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.12), rgba(2, 6, 23, 0.9) 60%);
          box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        .slot-window {
          width: 90px;
          height: 90px;
          border-radius: 16px;
          border: 2px solid rgba(255, 255, 255, 0.15);
          background: rgba(5, 10, 30, 0.85);
          position: relative;
          overflow: hidden;
        }

        .slot-strip {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          display: flex;
          flex-direction: column;
          transform: translateY(calc(-1 * var(--reel-offset, 0px)));
          transition: transform 360ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .slot-strip--spinning {
          animation-name: spin-reel;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          transition: none;
        }

        .slot-strip__symbol {
          width: 90px;
          height: 90px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .slot-symbol {
          width: 72px;
          height: 72px;
          display: flex;
          align-items: center;
          justify-content: center;
          filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.5));
        }

        .slot-symbol__img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .slot-symbol__text {
          font-size: 1.2rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #f8fafc;
          text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
        }

        .slot-strip--spinning .slot-symbol__img {
          filter: blur(0.6px);
          opacity: 0.9;
        }

        @keyframes spin-reel {
          from {
            transform: translateY(calc(-1 * var(--reel-offset, 0px)));
          }
          to {
            transform: translateY(
              calc(-1 * (var(--reel-offset, 0px) + ${SLOT_SYMBOLS.length * REEL_SYMBOL_HEIGHT}px))
            );
          }
        }
      `}</style>
    </DashboardShell>
  );
}
