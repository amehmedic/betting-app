"use client";
import { useState } from "react";
import DashboardShell from "@/components/DashboardShell";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function CoinPage() {
  const [amount, setAmount] = useState("1.00"); // keep raw input so users can edit freely
  const [pick, setPick] = useState<"heads" | "tails">("heads");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const parsedAmount = amount === "" ? NaN : Number(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount >= 0.01;

  async function flip() {
    if (!amountValid) {
      alert("Enter at least $0.01 before flipping.");
      return;
    }

    setBusy(true);
    setMsg("");
    const res = await fetch("/api/games/coin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: parsedAmount, pick }), // send dollars
    });
    setBusy(false);

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      return alert(j.error ?? "Bet failed");
    }

    const balanceCents =
      j?.wallet && typeof j.wallet.balance === "string" ? Number(j.wallet.balance) : NaN;

    setMsg(
      `Outcome: ${typeof j.outcome === "string" ? j.outcome.toUpperCase() : "UNKNOWN"} - ${
        j.win ? "YOU WIN!" : "you lose"
      } | New balance: ${
        Number.isFinite(balanceCents) ? usd.format(balanceCents / 100) : "n/a"
      }`
    );
  }

  return (
    <DashboardShell
      title="Coin Flip"
      description="Call heads or tails, drop a stake, and the bankroll updates instantly."
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <label className="text-sm uppercase tracking-wide text-slate-300">Your Pick</label>
            <div className="flex gap-2">
              {(["heads", "tails"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPick(option)}
                  className={`rounded-full px-4 py-1 text-sm font-semibold transition ${
                    pick === option
                      ? "bg-emerald-500 text-slate-950"
                      : "bg-white/10 text-slate-200 hover:bg-white/20"
                  }`}
                >
                  {option.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs uppercase tracking-wide text-slate-400">
              Amount (USD)
            </label>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-28 rounded border border-white/20 bg-slate-900/60 px-3 py-1 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
            />
            <span className="text-xs text-slate-400">
              {amountValid ? usd.format(parsedAmount) : "Enter stake"}
            </span>
          </div>
        </div>

        <button
          onClick={flip}
          disabled={busy || !amountValid}
          className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-lg font-semibold tracking-wide text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
        >
          {busy ? "Flipping..." : "Flip the coin"}
        </button>

        {msg && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm leading-relaxed text-emerald-100">
            {msg}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
