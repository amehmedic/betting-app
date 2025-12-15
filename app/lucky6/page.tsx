"use client";
import { useMemo, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import {
  LUCKY6_COLORS,
  listColorNumbers,
  Lucky6Color,
  Lucky6Ball,
} from "@/lib/lucky6";

type Lucky6BetResponse = {
  type: "first-parity" | "first-high-low" | "color-six";
  pick: string;
  amount: number;
  win: boolean;
  multiplier: number;
  completionPosition: number | null;
  payout: number;
};

type Lucky6Response = {
  ok: true;
  draw: {
    balls: Lucky6Ball[];
    completionOrder: Partial<Record<Lucky6Color, number>>;
    firstBall: Lucky6Ball;
  };
  bets: Lucky6BetResponse[];
  totals: { stake: number; payout: number };
  wallet: { balance: string; held: string };
};

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const parityOptions = [
  { value: "even" as const, label: "Even" },
  { value: "odd" as const, label: "Odd" },
];

const highLowOptions = [
  { value: "low" as const, label: "1-24" },
  { value: "high" as const, label: "25-48" },
];

const initialColorAmounts: Record<Lucky6Color, string> = LUCKY6_COLORS.reduce(
  (acc, color) => {
    acc[color] = "";
    return acc;
  },
  {} as Record<Lucky6Color, string>
);

function notifyWalletUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("wallet:update"));
  }
}

export default function Lucky6Page() {
  const [parityPick, setParityPick] = useState<"even" | "odd">("even");
  const [parityAmount, setParityAmount] = useState("");
  const [highLowPick, setHighLowPick] = useState<"low" | "high">("low");
  const [highLowAmount, setHighLowAmount] = useState("");
  const [colorAmounts, setColorAmounts] =
    useState<Record<Lucky6Color, string>>(initialColorAmounts);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Lucky6Response | null>(null);

  const totalStakePreview = useMemo(() => {
    const stakeValues: number[] = [];
    const parity = parseAmount(parityAmount);
    if (parity > 0) stakeValues.push(parity);
    const hl = parseAmount(highLowAmount);
    if (hl > 0) stakeValues.push(hl);
    for (const color of LUCKY6_COLORS) {
      const amt = parseAmount(colorAmounts[color]);
      if (amt > 0) stakeValues.push(amt);
    }
    return stakeValues.reduce((sum, value) => sum + value, 0);
  }, [parityAmount, highLowAmount, colorAmounts]);

  async function play() {
    if (busy) return;

    const bets: Array<{ type: string; pick: string; amount: number }> = [];

    const parity = parseAmount(parityAmount);
    if (parity > 0) {
      bets.push({
        type: "first-parity",
        pick: parityPick,
        amount: parity,
      });
    }

    const hl = parseAmount(highLowAmount);
    if (hl > 0) {
      bets.push({
        type: "first-high-low",
        pick: highLowPick,
        amount: hl,
      });
    }

    for (const color of LUCKY6_COLORS) {
      const amt = parseAmount(colorAmounts[color]);
      if (amt > 0) {
        bets.push({
          type: "color-six",
          pick: color,
          amount: amt,
        });
      }
    }

    if (bets.length === 0) {
      setError("Add at least one bet before playing.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/games/lucky6", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bets }),
      });
      const json = (await res.json().catch(() => ({}))) as
        | Lucky6Response
        | { error?: string };
      if (!res.ok || !json || json.ok !== true) {
        setError((json as any)?.error ?? "Lucky 6 round failed");
        return;
      }

      setLastResult(json as Lucky6Response);
      notifyWalletUpdate();
    } catch (err) {
      console.error(err);
      setError("Lucky 6 round failed");
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setParityAmount("");
    setHighLowAmount("");
    setColorAmounts(initialColorAmounts);
    setError(null);
  }

  return (
    <DashboardShell
      title="Lucky 6"
      description="Draw 35 balls, parlay quick predictions, or hit the full-color jackpots for huge multipliers."
    >
      <div className="space-y-6">
        <section className="space-y-6 rounded-xl border border-white/10 bg-white/5 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-white">
                First ball parity (1.80x)
              </legend>
              <div className="flex gap-3">
                {parityOptions.map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-200"
                  >
                    <input
                      type="radio"
                      name="parity"
                      checked={parityPick === option.value}
                      onChange={() => setParityPick(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <input
                type="number"
                min={0}
                step={0.01}
                value={parityAmount}
                onChange={(e) => setParityAmount(e.target.value)}
                placeholder="Stake (USD)"
              className="w-full rounded border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30"
              />
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-white">
                First ball value (1.80x)
              </legend>
              <div className="flex gap-3">
                {highLowOptions.map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-200"
                  >
                    <input
                      type="radio"
                      name="highlow"
                      checked={highLowPick === option.value}
                      onChange={() => setHighLowPick(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <input
                type="number"
                min={0}
                step={0.01}
                value={highLowAmount}
                onChange={(e) => setHighLowAmount(e.target.value)}
                placeholder="Stake (USD)"
              className="w-full rounded border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30"
              />
            </fieldset>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Full color completion payouts (6th to 35th draw)
            </h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {LUCKY6_COLORS.map((color) => (
                <div
                  key={color}
                  className="space-y-2 rounded-lg border border-white/10 bg-slate-900/60 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold uppercase text-white">{color}</span>
                    <button
                      type="button"
                      className="text-xs text-slate-400 underline"
                      onClick={() => setColorAmounts((prev) => ({ ...prev, [color]: "" }))}
                    >
                      Clear
                    </button>
                  </div>
                  <div className="text-xs text-slate-400">
                    Numbers: {listColorNumbers(color).join(", ")}
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={colorAmounts[color]}
                    onChange={(e) =>
                      setColorAmounts((prev) => ({
                        ...prev,
                        [color]: e.target.value,
                      }))
                    }
                    placeholder="Stake (USD)"
                    className="w-full rounded border border-white/20 bg-slate-950/70 px-3 py-2 text-sm text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={play}
              disabled={busy}
            className="rounded-lg bg-[#c5305f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a61a42] disabled:cursor-not-allowed disabled:bg-[#c5305f]/50"
            >
              {busy ? "Drawing..." : "Play Lucky 6"}
            </button>
            <button
              onClick={resetForm}
              disabled={busy}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-[#5c7cfa] hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
            >
              Reset stakes
            </button>
            <span className="text-sm text-slate-300">
              Total stake: {usd.format(totalStakePreview)}
            </span>
          </div>

          {error && <div className="text-sm text-red-400">{error}</div>}
        </section>

        {lastResult && (
          <section className="space-y-4 rounded-xl border border-white/10 bg-slate-900/60 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  Draw outcome
                </div>
                <div className="text-lg font-semibold text-white">
                  First ball: {lastResult.draw.firstBall.number} ({lastResult.draw.firstBall.color})
                </div>
                <div className="text-sm text-slate-300">
                  Stake {usd.format(lastResult.totals.stake)} &rarr; Payout {usd.format(lastResult.totals.payout)}
                </div>
              </div>
              <div className="text-right text-sm text-slate-300">
                Balance: {usd.format(Number(lastResult.wallet.balance) / 100)} | Held:{" "}
                {usd.format(Number(lastResult.wallet.held) / 100)}
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-slate-200">Bets</h3>
              <div className="mt-2 space-y-2">
                {lastResult.bets.map((bet, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-200"
                  >
                    <div>
                      <div className="font-semibold uppercase text-white">{friendlyBetLabel(bet)}</div>
                      <div className="text-xs text-slate-400">
                        Stake {usd.format(bet.amount)} - Multiplier{" "}
                        {bet.win ? bet.multiplier.toLocaleString() : "-"}
                        {bet.completionPosition ? ` - Completed on draw ${bet.completionPosition}` : ""}
                      </div>
                    </div>
                    <div className={`font-semibold ${bet.win ? "text-[#8db6ff]" : "text-slate-500"}`}>
                      {bet.win ? `Won ${usd.format(bet.payout)}` : "Lost"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-slate-200">Draw order</h3>
              <div className="mt-2 flex flex-wrap gap-2 font-mono text-xs text-slate-100">
                {lastResult.draw.balls.map((ball, idx) => (
                  <span
                    key={idx}
                    className="rounded bg-slate-950/70 px-2 py-1 shadow shadow-black/20"
                    title={`#${ball.number} - ${ball.color}`}
                  >
                    {idx + 1}. {ball.number} ({ball.color})
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}

function parseAmount(value: string): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function friendlyBetLabel(bet: Lucky6BetResponse) {
  if (bet.type === "first-parity") {
    return `First ball ${bet.pick}`;
  }
  if (bet.type === "first-high-low") {
    return bet.pick === "high" ? "First ball 25-48" : "First ball 1-24";
  }
  return `All six ${bet.pick}`;
}
