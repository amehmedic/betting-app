"use client";
import { useMemo, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import clsx from "clsx";
import {
  LUCKY6_COLORS,
  Lucky6Ball,
  Lucky6Color,
  colorForNumber,
} from "@/lib/lucky6";

type Lucky6BetResponse = {
  type:
    | "first-parity"
    | "first-high-low"
    | "first-five-sum"
    | "first-five-parity"
    | "first-color"
    | "color-six"
    | "combo-six";
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

const colorMeta: Record<
  Lucky6Color,
  { bg: string; ring: string; text: string }
> = {
  red: { bg: "#c5305f", ring: "ring-rose-300/40", text: "text-rose-50" },
  blue: { bg: "#2563eb", ring: "ring-sky-300/40", text: "text-sky-50" },
  green: { bg: "#16a34a", ring: "ring-emerald-300/40", text: "text-emerald-50" },
  yellow: { bg: "#facc15", ring: "ring-amber-300/40", text: "text-amber-900" },
  purple: { bg: "#7c3aed", ring: "ring-purple-300/40", text: "text-purple-50" },
  orange: { bg: "#f97316", ring: "ring-orange-300/50", text: "text-orange-50" },
  brown: { bg: "#8b5a2b", ring: "ring-amber-400/40", text: "text-amber-50" },
  pink: { bg: "#ec4899", ring: "ring-pink-300/40", text: "text-rose-50" },
  black: { bg: "#0f172a", ring: "ring-slate-400/40", text: "text-slate-100" },
};

function notifyWalletUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("wallet:update"));
  }
}

export default function Lucky6Page() {
  const { pendingBets, toggleBet, removeBet, clearBets } = useBets();
  const [parityPick, setParityPick] = useState<"even" | "odd">("even");
  const [highLowPick, setHighLowPick] = useState<"low" | "high">("low");
  const [sumPick, setSumPick] = useState<"over" | "under">("over");
  const [amount, setAmount] = useState("5.00");
  const [firstFiveParityPick, setFirstFiveParityPick] = useState<"even" | "odd">("even");
  const [firstColorPick, setFirstColorPick] = useState<Lucky6Color>("red");
  const [comboNumbers, setComboNumbers] = useState("");
  const [stakeAmount, setStakeAmount] = useState("5.00");
  const [selectedColor, setSelectedColor] = useState<Lucky6Color>("red");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Lucky6Response | null>(null);

  const totalStakePreview = useMemo(() => {
    const stake = parseAmount(stakeAmount);
    return stake * pendingBets.length;
  }, [stakeAmount, pendingBets]);

  const stakeValue = parseAmount(stakeAmount);

  const betAmountFor = (type: Lucky6BetResponse["type"], pick: string | number) =>
    pendingBets.find((b) => b.type === type && b.pick === pick) ? stakeValue : 0;

  const renderBadge = (value: number) =>
    value > 0 ? (
      <span className="pointer-events-none absolute left-1/2 top-1/2 inline-flex min-w-[32px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-[#c5305f] px-2 py-1 text-[11px] font-semibold text-white shadow-lg shadow-black/40">
        ${value.toFixed(2)}
      </span>
    ) : null;

  async function play() {
    if (busy) return;

    const stake = parseAmount(stakeAmount);
    if (stake <= 0) {
      setError("Stake must be greater than 0.");
      return;
    }

    // Validate combo bet if present
    for (const bet of pendingBets) {
      if (bet.type === "combo-six") {
        const comboList = parseCombo(bet.pick);
        if (!comboList) {
          setError("Combo bet must have 6 unique numbers between 1 and 48.");
          return;
        }
      }
    }

    if (pendingBets.length === 0) {
      setError("Add at least one bet.");
      return;
    }

    const bets = pendingBets.map((bet) => ({ ...bet, amount: stake }));

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/games/lucky6", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bets }),
      });
      const json = (await res.json().catch(() => null)) as Lucky6Response | { error?: string } | null;
      if (!res.ok || !json || (json as any).ok !== true) {
        setError((json as any)?.error ?? "Bet failed");
      } else {
        const ok = json as Lucky6Response;
        setLastResult(ok);
        notifyWalletUpdate();
      }
    } catch (e) {
      console.error(e);
      setError("Bet failed");
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    clearBets();
    setStakeAmount("5.00");
    setSelectedColor("red");
    setSumPick("over");
    setFirstFiveParityPick("even");
    setFirstColorPick("red");
    setComboNumbers("");
    setError(null);
  }

  return (
    <DashboardShell title="" description="">
      <div className="mx-auto max-w-6xl space-y-8 text-center">
        <h1 className="text-3xl font-semibold text-white">Lucky 6</h1>
        <section className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/30 text-left">
          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-2">
                <label className="text-xs uppercase tracking-wide text-slate-400">Bet amount (USD)</label>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-32 rounded border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30 disabled:cursor-not-allowed disabled:text-slate-500"
                />
                <span className="text-xs text-slate-400">
                  {amount ? `$${Number(amount).toFixed(2)}` : "$0.00"}
                </span>
              </div>
                <div className="grid gap-15 sm:grid-cols-2">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <label className="text-xs uppercase tracking-wide text-slate-400">First ball parity</label>
                    <div className="grid grid-cols-2 gap-2">
                      {parityOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setParityPick(opt.value);
                            toggleBet("first-parity", opt.value);
                          }}
                          className={clsx(
                            "relative rounded-lg border px-3 py-2 text-sm font-semibold transition",
                            parityPick === opt.value
                              ? "border-[#5c7cfa] bg-[#5c7cfa]/20 text-white"
                              : "border-white/15 bg-slate-950/60 text-slate-300 hover:border-white/30"
                          )}
                          disabled={busy}
                        >
                          {opt.label}
                          {renderBadge(betAmountFor("first-parity", opt.value))}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-2 text-center">
                  <label className="text-xs uppercase tracking-wide text-slate-400">First ball range (24.5)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {highLowOptions.map((opt) => (
                      <button
                        key={opt.value}
                          onClick={() => {
                            setHighLowPick(opt.value);
                            toggleBet("first-high-low", opt.value === "high" ? "high" : "low");
                          }}
                          className={clsx(
                            "relative rounded-lg border px-3 py-2 text-sm font-semibold transition",
                            highLowPick === opt.value
                              ? "border-[#5c7cfa] bg-[#5c7cfa]/20 text-white"
                              : "border-white/15 bg-slate-950/60 text-slate-300 hover:border-white/30"
                          )}
                          disabled={busy}
                        >
                          {opt.label}
                          {renderBadge(betAmountFor("first-high-low", opt.value === "high" ? "high" : "low"))}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

              <div className="grid gap-15 sm:grid-cols-2">
                <div className="flex flex-col items-center gap-2 text-center">
                  <label className="text-xs uppercase tracking-wide text-slate-400">First 5 sum vs 122.5</label>
                  <div className="grid grid-cols-2 gap-2">
                    {["over", "under"].map((opt) => (
                      <button
                        key={opt}
                        onClick={() => {
                          setSumPick(opt as "over" | "under");
                          toggleBet("first-five-sum", opt);
                        }}
                        className={clsx(
                          "relative rounded-lg border px-3 py-2 text-sm font-semibold transition",
                          sumPick === opt
                            ? "border-[#5c7cfa] bg-[#5c7cfa]/20 text-white"
                            : "border-white/15 bg-slate-950/60 text-slate-300 hover:border-white/30"
                        )}
                        disabled={busy}
                      >
                        {opt === "over" ? "Over 122.5" : "Under 122.5"}
                        {renderBadge(betAmountFor("first-five-sum", opt))}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2 text-center">
                  <label className="text-xs uppercase tracking-wide text-slate-400">First 5: more even or odd</label>
                  <div className="grid grid-cols-2 gap-2">
                    {["even", "odd"].map((opt) => (
                      <button
                        key={opt}
                        onClick={() => {
                          setFirstFiveParityPick(opt as "even" | "odd");
                          toggleBet("first-five-parity", opt);
                        }}
                        className={clsx(
                          "relative rounded-lg border px-3 py-2 text-sm font-semibold transition",
                          firstFiveParityPick === opt
                            ? "border-[#5c7cfa] bg-[#5c7cfa]/20 text-white"
                            : "border-white/15 bg-slate-950/60 text-slate-300 hover:border-white/30"
                        )}
                        disabled={busy}
                      >
                        {opt === "even" ? "More even" : "More odd"}
                        {renderBadge(betAmountFor("first-five-parity", opt))}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-inner shadow-black/30">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">Color bets</div>
                    <div className="text-xs text-slate-400">Pick first-ball color or color to reach 6</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={firstColorPick}
                      onChange={(e) => setFirstColorPick(e.target.value as Lucky6Color)}
                      className="rounded-md border border-white/15 bg-slate-950/70 px-2 py-1 text-xs text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30"
                      disabled={busy}
                    >
                      {LUCKY6_COLORS.map((c) => (
                        <option key={c} value={c}>
                          First ball {c}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => toggleBet("first-color", firstColorPick)}
                      disabled={busy}
                      className="rounded-md border border-[#5c7cfa]/60 px-3 py-1 text-xs font-semibold text-white transition hover:bg-[#5c7cfa]/20 disabled:cursor-not-allowed disabled:border-white/10"
                    >
                      Toggle first-color bet
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-8 gap-2 rounded-xl border border-white/5 bg-slate-950/50 p-3">
                  {Array.from({ length: 48 }, (_, i) => i + 1).map((num) => {
                    const color = colorForNumber(num);
                    const meta = colorMeta[color];
                    const isSelected = selectedColor === color;
                    const active = pendingBets.some((b) => b.type === "color-six" && b.pick === color);
                    return (
                      <button
                        key={num}
                        onClick={() => {
                          setSelectedColor(color);
                          toggleBet("color-six", color);
                        }}
                        className={clsx(
                          "relative flex h-10 items-center justify-center rounded-lg border text-sm font-semibold transition",
                          isSelected ? `ring-2 ring-offset-2 ring-offset-slate-900 ${meta.ring}` : "border-white/15",
                          meta.text
                        )}
                        title={`Number ${num} (${color})`}
                        disabled={busy}
                        style={{ backgroundColor: meta.bg }}
                      >
                        {active && (
                          <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70 px-2 py-[2px] text-[10px] text-white">
                            Bet
                          </span>
                        )}
                        <span>{num}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 text-sm text-slate-400">
                  Click any number to toggle a color-to-6 bet for that color.
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 text-left">
                  <label className="text-xs uppercase tracking-wide text-slate-400">
                    Combo bet (pick exactly 6 numbers)
                  </label>
                  <input
                    type="text"
                    value={comboNumbers}
                    onChange={(e) => setComboNumbers(e.target.value)}
                    placeholder="e.g. 1,18,28,29,30,39"
                    className="w-full rounded-lg border border-white/20 bg-slate-950/70 px-3 py-2 text-sm text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30"
                  />
                  <button
                    type="button"
                    onClick={() => toggleBet("combo-six", comboNumbers)}
                    className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-[#5c7cfa] hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                  >
                    Toggle combo bet
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-center">
                <div className="text-sm text-slate-300">Total stake: {usd.format(totalStakePreview)}</div>
                <div className="flex items-center justify-center">
                  <button
                    onClick={play}
                    disabled={busy || pendingBets.length === 0}
                    className="w-full max-w-sm rounded-xl bg-[#c5305f] px-6 py-3 text-lg font-semibold text-white transition hover:bg-[#a61a42] disabled:cursor-not-allowed disabled:bg-[#c5305f]/50"
                  >
                    {busy ? "Playing..." : "Play Lucky 6"}
                  </button>
                </div>
              </div>

              {error && <div className="text-sm text-red-400">{error}</div>}
            </div>

            {lastResult && (
              <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-xl shadow-black/30">
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <div className="font-semibold text-white">Last draw</div>
                  <div>
                    Stake {usd.format(lastResult.totals.stake)} | Payout {usd.format(lastResult.totals.payout)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {lastResult.draw.balls.map((ball, idx) => {
                    const meta = colorMeta[ball.color];
                    return (
                      <div
                        key={idx}
                        className={clsx("ball ball--sm", "ring-1", meta.ring)}
                        style={{ backgroundColor: meta.bg }}
                        title={`#${idx + 1} - ${ball.number} (${ball.color})`}
                      >
                        <span className="ball__number text-[0.75rem]">{ball.number}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-2 text-sm text-slate-200">
                  <div className="font-semibold">Bets</div>
                  <div className="space-y-2">
                    {lastResult.bets.map((bet, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-200">
                        <span className="font-semibold">{friendlyBetLabel(bet)}</span>
                        <span className={bet.win ? "text-emerald-400" : "text-slate-400"}>
                          {bet.win ? `Won ${usd.format(bet.payout)}` : "Lost"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

              <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-inner shadow-black/20">
              <div className="flex items-center justify-between text-sm text-slate-200">
                <div className="font-semibold">Current bets</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={clearBets}
                    className="rounded-md border border-white/15 px-3 py-1 text-xs text-slate-200 hover:border-white/40"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {pendingBets.length === 0 && <div className="text-sm text-slate-400">No bets added.</div>}
                {pendingBets.map((bet, idx) => (
                  <div
                    key={`${bet.type}-${bet.pick}-${idx}`}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-200"
                  >
                    <span className="font-semibold">{friendlyBetLabel(bet as Lucky6BetResponse)}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">{usd.format(parseAmount(stakeAmount))}</span>
                      <button
                        type="button"
                        onClick={() => removeBet(bet.type, bet.pick)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

/* Ball styling */
const ballBase = `
  .ball {
    width: 52px;
    height: 52px;
    border-radius: 9999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }
  .ball__number {
    font-weight: 800;
    color: #0b1224;
    text-shadow: 0 1px 0 rgba(255,255,255,0.4);
  }
  .ball::after {
    content: "";
    position: absolute;
    inset: 6px;
    border-radius: 9999px;
    background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4), transparent 60%);
    pointer-events: none;
  }
  .ball--sm {
    width: 36px;
    height: 36px;
  }
  .ball--sm .ball__number {
    font-size: 0.8rem;
  }
`;

if (typeof document !== "undefined" && !document.getElementById("lucky6-ball-style")) {
  const style = document.createElement("style");
  style.id = "lucky6-ball-style";
  style.textContent = ballBase;
  document.head.appendChild(style);
}

function parseAmount(value: string): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseCombo(value: string): number[] | null {
  const parts = value
    .split(",")
    .map((p) => Number.parseInt(p.trim(), 10))
    .filter((n) => Number.isFinite(n));
  if (parts.length !== 6) return null;
  const uniq = Array.from(new Set(parts)).filter((n) => n >= 1 && n <= 48);
  if (uniq.length !== 6) return null;
  return uniq;
}

function useBets() {
  const [pendingBets, setPendingBets] = useState<Array<{ type: Lucky6BetResponse["type"]; pick: string }>>([]);

  function toggleBet(type: Lucky6BetResponse["type"], pick: string) {
    setPendingBets((prev) =>
      prev.some((b) => b.type === type && b.pick === pick)
        ? prev.filter((b) => !(b.type === type && b.pick === pick))
        : [...prev, { type, pick }]
    );
  }

  function removeBet(type: Lucky6BetResponse["type"], pick: string) {
    setPendingBets((prev) => prev.filter((b) => !(b.type === type && b.pick === pick)));
  }

  function clearBets() {
    setPendingBets([]);
  }

  return { pendingBets, toggleBet, removeBet, clearBets };
}

function friendlyBetLabel(bet: Lucky6BetResponse) {
  if (bet.type === "first-parity") {
    return `First ball ${bet.pick}`;
  }
  if (bet.type === "first-high-low") {
    return bet.pick === "high" ? "First ball over 24.5" : "First ball under 24.5";
  }
  if (bet.type === "first-five-sum") {
    return bet.pick === "over" ? "Sum first 5 over 122.5" : "Sum first 5 under 122.5";
  }
  if (bet.type === "first-five-parity") {
    return bet.pick === "even" ? "More even in first 5" : "More odd in first 5";
  }
  if (bet.type === "first-color") {
    return `First ball color ${bet.pick}`;
  }
  if (bet.type === "combo-six") {
    return `Combo ${bet.pick}`;
  }
  return `All six ${bet.pick}`;
}
