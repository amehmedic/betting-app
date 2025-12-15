"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import DashboardShell from "@/components/DashboardShell";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const SPIN_DURATION_MS = 1600;

function notifyWalletUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("wallet:update"));
  }
}

export default function CoinPage() {
  const [amount, setAmount] = useState("1.00"); // keep raw input so users can edit freely
  const [pick, setPick] = useState<"heads" | "tails">("heads");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [coinFace, setCoinFace] = useState<"heads" | "tails">("heads");
  const [lastOutcome, setLastOutcome] = useState<"heads" | "tails" | null>(null);
  const [coinSpinning, setCoinSpinning] = useState(false);
  const [resultTone, setResultTone] = useState<"win" | "loss" | null>(null);
  const spinTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMessageRef = useRef<string | null>(null);
  const pendingResultToneRef = useRef<"win" | "loss" | null>(null);

  const parsedAmount = amount === "" ? NaN : Number(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount >= 0.01;

  useEffect(() => {
    return () => {
      if (spinTimeout.current) clearTimeout(spinTimeout.current);
      pendingMessageRef.current = null;
      pendingResultToneRef.current = null;
    };
  }, []);

  async function flip() {
    if (!amountValid) {
      alert("Enter at least $0.01 before flipping.");
      return;
    }

    if (spinTimeout.current) {
      clearTimeout(spinTimeout.current);
      spinTimeout.current = null;
    }
    pendingMessageRef.current = null;

    const selection = pick;
    setBusy(true);
    setCoinSpinning(true);
    setMsg("");
    setResultTone(null);

    try {
      const res = await fetch("/api/games/coin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parsedAmount, pick: selection }), // send dollars
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCoinSpinning(false);
        return alert(j.error ?? "Bet failed");
      }

      const balanceCents =
        j?.wallet && typeof j.wallet.balance === "string" ? Number(j.wallet.balance) : NaN;
      const outcome = j?.outcome === "tails" ? "tails" : "heads";

      setCoinFace(outcome);
      setLastOutcome(outcome);
      pendingMessageRef.current = `You picked ${selection.toUpperCase()}. Outcome ${outcome.toUpperCase()} — ${
        j.win ? "YOU WIN!" : "you lose."
      } New balance: ${
        Number.isFinite(balanceCents) ? usd.format(balanceCents / 100) : "n/a"
      }.`;
      pendingResultToneRef.current = j.win ? "win" : "loss";

      spinTimeout.current = setTimeout(() => {
        setCoinSpinning(false);
        if (pendingMessageRef.current) {
          setMsg(pendingMessageRef.current);
          pendingMessageRef.current = null;
        }
        if (pendingResultToneRef.current) {
          setResultTone(pendingResultToneRef.current);
          pendingResultToneRef.current = null;
        }
        spinTimeout.current = null;
      }, SPIN_DURATION_MS);

      notifyWalletUpdate();
    } catch (err) {
      console.error(err);
      setCoinSpinning(false);
      alert("Bet failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const coinClass = clsx("coin", {
    "coin--spinning": coinSpinning,
    "coin--heads": !coinSpinning && coinFace === "heads",
    "coin--tails": !coinSpinning && coinFace === "tails",
  });

  return (
    <DashboardShell
      title=""
      description=""
    >
      <>
        <div className="mx-auto max-w-4xl space-y-8 text-center">
          <div>
            <h1 className="text-3xl font-semibold text-white">Coin Flip</h1>
            <p className="mt-1 text-sm text-slate-300">
              Call heads or tails, drop a stake, and the bankroll updates instantly.
            </p>
          </div>

          <div className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
            <div>
              <h3 className="text-lg font-semibold text-white">Pick your side</h3>
              <p className="text-xs uppercase tracking-wide text-slate-400">Heads or Tails</p>
              <div className="mt-4 flex justify-center gap-2">
                {(["heads", "tails"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPick(option)}
                    className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                      pick === option
                        ? "bg-[#c5305f] text-white shadow-lg shadow-[#c5305f]/30"
                        : "bg-white/10 text-slate-200 hover:bg-white/20"
                    }`}
                  >
                    {option.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-400">Amount (USD)</label>
              <div className="mt-2 flex flex-col items-center gap-3">
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-left focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/40 md:w-48"
                />
                <span className="text-xs text-slate-400">
                  {amountValid ? usd.format(parsedAmount) : "Enter stake"}
                </span>
              </div>
            </div>
            <button
              onClick={flip}
              disabled={busy || !amountValid}
              className="w-full rounded-xl bg-[#c5305f] px-4 py-3 text-lg font-semibold tracking-wide text-white transition hover:bg-[#a61a42] disabled:cursor-not-allowed disabled:bg-[#c5305f]/50"
            >
              {busy ? "Flipping..." : "Flip the coin"}
            </button>
          </div>

          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0a0414]/85 via-[#101e46]/70 to-[#230c1c]/85 p-8 text-center shadow-2xl shadow-black/40">
            <div className="flex justify-center">
              <div className={coinClass} aria-live="polite" aria-label={`Coin showing ${coinFace}`}>
                <div className="coin-face coin-face--front">
                  <span>HEADS</span>
                </div>
                <div className="coin-face coin-face--back">
                  <span>TAILS</span>
                </div>
                <div className="coin-edge" />
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-300">
              {coinSpinning
                ? "Coin is in the air..."
                : lastOutcome
                ? `Landed on ${lastOutcome.toUpperCase()}.`
                : "Pick a side and press flip to get started."}
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
          .coin {
            width: 150px;
            height: 150px;
            position: relative;
            transform-style: preserve-3d;
            transition: transform 0.6s cubic-bezier(0.4, 0.2, 0, 1);
          }

          .coin::after {
            content: "";
            position: absolute;
            inset: -6px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(16, 185, 129, 0.2), transparent 70%);
            filter: blur(16px);
            z-index: 0;
          }

          .coin-face {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            background: radial-gradient(circle at 30% 30%, #fafafa, #d1d5db 60%, #9ca3af);
            border: 4px solid rgba(15, 23, 42, 0.6);
            font-size: 0.8rem;
            letter-spacing: 0.2em;
            font-weight: 700;
            color: #0f172a;
            backface-visibility: hidden;
            box-shadow:
              inset 0 4px 8px rgba(255, 255, 255, 0.6),
              inset 0 -4px 8px rgba(15, 23, 42, 0.4);
          }

          .coin-face--back {
            transform: rotateY(180deg);
            background: radial-gradient(circle at 70% 30%, #e2e8f0, #94a3b8 60%, #64748b);
          }

          .coin-edge {
            position: absolute;
            inset: 6%;
            border-radius: 50%;
            border: 6px solid rgba(15, 23, 42, 0.8);
            box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.5);
            transform: translateZ(-4px);
          }

          .coin--heads {
            transform: rotateY(0deg);
          }

          .coin--tails {
            transform: rotateY(180deg);
          }

          .coin--spinning {
            animation: coin-spin 0.35s linear infinite;
          }

          @keyframes coin-spin {
            0% {
              transform: rotateY(0deg) rotateX(0deg);
            }
            25% {
              transform: rotateY(180deg) rotateX(35deg);
            }
            100% {
              transform: rotateY(720deg) rotateX(0deg);
            }
          }
      `}</style>
      </>
    </DashboardShell>
  );
}
