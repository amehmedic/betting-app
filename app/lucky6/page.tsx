"use client";
import { useEffect, useMemo, useState } from "react";
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

function formatSignedUsd(value: number) {
  if (value < 0) {
    return `-${usd.format(Math.abs(value))}`;
  }
  return usd.format(value);
}

const parityOptions = [
  { value: "even" as const, label: "Even" },
  { value: "odd" as const, label: "Odd" },
];

const highLowOptions = [
  { value: "low" as const, label: "Under 24.5" },
  { value: "high" as const, label: "Over 24.5" },
];

const comboCompletionPayouts = [
  10000,
  7500,
  5000,
  2500,
  1000,
  500,
  300,
  200,
  150,
  100,
  80,
  60,
  40,
  30,
  25,
  20,
  18,
  16,
  14,
  12,
  10,
  9,
  8,
  7,
  6,
  5,
  4,
  3,
  2,
  1,
];

const colorMeta: Record<
  Lucky6Color,
  { bg: string; ring: string; text: string }
> = {
  red: { bg: "#c5305f", ring: "ring-rose-300/40", text: "text-rose-50" },
  blue: { bg: "#2563eb", ring: "ring-sky-300/40", text: "text-sky-50" },
  green: { bg: "#16a34a", ring: "ring-emerald-300/40", text: "text-emerald-50" },
  yellow: { bg: "#facc15", ring: "ring-amber-300/40", text: "text-white" },
  purple: { bg: "#7c3aed", ring: "ring-purple-300/40", text: "text-purple-50" },
  orange: { bg: "#f97316", ring: "ring-orange-300/50", text: "text-orange-50" },
  brown: { bg: "#8b5a2b", ring: "ring-amber-400/40", text: "text-amber-50" },
  pink: { bg: "#ec4899", ring: "ring-pink-300/40", text: "text-rose-50" },
  black: { bg: "#0f172a", ring: "ring-slate-400/40", text: "text-white" },
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
  const [firstFiveParityPick, setFirstFiveParityPick] = useState<"even" | "odd">("even");
  const [firstColorPick, setFirstColorPick] = useState<Lucky6Color>("red");
  const [comboNumbers, setComboNumbers] = useState("");
  const [comboSelection, setComboSelection] = useState<number[]>([]);
  const [stakeAmount, setStakeAmount] = useState("5.00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Lucky6Response | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const drawSlots = 35;

  const formatQuota = (value: number) => {
    if (value >= 1000) {
      const scaled = value / 1000;
      const label = Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(1);
      return `${label}k`;
    }
    return String(value);
  };

  const totalStakePreview = useMemo(
    () => pendingBets.reduce((sum, bet) => sum + (Number.isFinite(bet.amount) ? bet.amount : 0), 0),
    [pendingBets]
  );

  const stakeValue = parseAmount(stakeAmount);

  const betAmountFor = (type: Lucky6BetResponse["type"], pick: string | number) =>
    pendingBets.find((b) => b.type === type && b.pick === pick)?.amount ?? 0;

  const renderBadge = (value: number, extra?: string) =>
    value > 0 ? (
      <span
        className={clsx(
          "pointer-events-none absolute left-1/2 top-1/2 inline-flex min-w-[32px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-[#c5305f] px-2 py-1 text-[11px] font-semibold text-white shadow-lg shadow-black/40",
          extra
        )}
      >
        ${value.toFixed(2)}
      </span>
    ) : null;

  const syncComboSelection = (next: number[]) => {
    const unique = Array.from(new Set(next)).filter((n) => n >= 1 && n <= 48).slice(0, 6);
    const sorted = [...unique].sort((a, b) => a - b);
    setComboSelection(unique);
    setComboNumbers(sorted.join(", "));
  };

  const toggleComboNumber = (num: number) => {
    const exists = comboSelection.includes(num);
    setError(null);
    if (exists) {
      syncComboSelection(comboSelection.filter((n) => n !== num));
      return;
    }
    if (comboSelection.length >= 6) return;
    syncComboSelection([...comboSelection, num]);
  };

  const sortedComboKey = [...comboSelection].sort((a, b) => a - b).join(",");
  const comboAlreadyAdded =
    comboSelection.length === 6 &&
    pendingBets.some((b) => b.type === "combo-six" && b.pick === sortedComboKey);

  const addComboBet = () => {
    const sorted = [...comboSelection].sort((a, b) => a - b);
    if (sorted.length !== 6) {
      setError("Select exactly 6 numbers before adding a combo bet.");
      return;
    }
    if (!Number.isFinite(stakeValue) || stakeValue <= 0) {
      setError("Stake must be greater than 0.");
      return;
    }
    const pick = sorted.join(",");
    if (pendingBets.some((b) => b.type === "combo-six" && b.pick === pick)) {
      setError("This combo bet is already added.");
      return;
    }
    toggleBet("combo-six", pick, stakeValue);
    syncComboSelection([]);
  };

  useEffect(() => {
    if (!lastResult) return;
    const total = lastResult.draw.balls.length;
    let current = 0;
    setRevealedCount(0);
    setIsDrawing(true);

    const interval = window.setInterval(() => {
      current += 1;
      setRevealedCount(current);
      if (current >= total) {
        window.clearInterval(interval);
        setIsDrawing(false);
      }
    }, 450);

    return () => {
      window.clearInterval(interval);
    };
  }, [lastResult]);

  const toggleFirstColor = (color: Lucky6Color) => {
    toggleBet("first-color", color, stakeValue);
    setFirstColorPick(color);
  };

  const toggleColumnSelection = (columnIndex: number) => {
    const columnNumbers = Array.from({ length: 6 }, (_, row) => columnIndex + 1 + row * 8);
    const isExactColumn =
      comboSelection.length === columnNumbers.length &&
      comboSelection.every((n) => columnNumbers.includes(n));
    if (isExactColumn) {
      syncComboSelection([]);
      return;
    }
    syncComboSelection(columnNumbers);
  };

  async function play() {
    if (busy) return;

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

    if (pendingBets.some((bet) => !Number.isFinite(bet.amount) || bet.amount <= 0)) {
      setError("All bets must have a valid stake amount.");
      return;
    }

    const bets = pendingBets.map((bet) => ({ ...bet, amount: bet.amount }));

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

  const clearAllBets = () => {
    clearBets();
    setComboSelection([]);
    setComboNumbers("");
  };

  function resetForm() {
    clearAllBets();
    setStakeAmount("5.00");
    setSumPick("over");
    setFirstFiveParityPick("even");
    setFirstColorPick("red");
    setError(null);
  }

  return (
    <DashboardShell title="" description="">
      <div className="mx-auto max-w-6xl space-y-8 text-center">
        <h1 className="text-3xl font-semibold text-white">Lucky 6</h1>
        <section className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/30 text-left">
          <div className="grid gap-6 lg:grid-cols-[1.13fr_1fr]">
            <div className="space-y-3">
              <div className="flex flex-col items-center gap-2">
                <label className="text-xs uppercase tracking-wide text-slate-400">Bet amount (USD)</label>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  className="w-32 rounded border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30 disabled:cursor-not-allowed disabled:text-slate-500"
                />
                <span className="text-xs text-slate-400">
                  {stakeAmount ? `$${Number(stakeAmount).toFixed(2)}` : "$0.00"}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-inner shadow-black/30 space-y-2 text-center">
                  <div className="text-xs uppercase tracking-wide text-slate-400">First ball parity</div>
                  <div className="grid grid-cols-2 gap-2">
                    {parityOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setParityPick(opt.value);
                          toggleBet("first-parity", opt.value, stakeValue);
                        }}
                        className="relative rounded-lg border border-white/15 bg-slate-950/60 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-white/30"
                        disabled={busy}
                      >
                        {opt.label}
                        {renderBadge(betAmountFor("first-parity", opt.value))}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-inner shadow-black/30 space-y-2 text-center">
                  <div className="text-xs uppercase tracking-wide text-slate-400">First ball value</div>
                  <div className="grid grid-cols-2 gap-2">
                    {highLowOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setHighLowPick(opt.value);
                          toggleBet("first-high-low", opt.value === "high" ? "high" : "low", stakeValue);
                        }}
                        className="relative rounded-lg border border-white/15 bg-slate-950/60 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-white/30"
                        disabled={busy}
                      >
                        {opt.label}
                        {renderBadge(betAmountFor("first-high-low", opt.value === "high" ? "high" : "low"))}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-inner shadow-black/30 space-y-2 text-center">
                  <div className="text-xs uppercase tracking-wide text-slate-400">First 5 balls parity</div>
                  <div className="grid grid-cols-2 gap-2">
                    {["even", "odd"].map((opt) => (
                      <button
                        key={opt}
                        onClick={() => {
                          setFirstFiveParityPick(opt as "even" | "odd");
                          toggleBet("first-five-parity", opt, stakeValue);
                        }}
                        className="relative rounded-lg border border-white/15 bg-slate-950/60 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-white/30"
                        disabled={busy}
                      >
                        {opt === "even" ? "More even" : "More odd"}
                        {renderBadge(betAmountFor("first-five-parity", opt))}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-inner shadow-black/30 space-y-2 text-center">
                  <div className="text-xs uppercase tracking-wide text-slate-400">Sum of first 5 balls</div>
                  <div className="grid grid-cols-2 gap-2">
                    {["over", "under"].map((opt) => (
                      <button
                        key={opt}
                        onClick={() => {
                          setSumPick(opt as "over" | "under");
                          toggleBet("first-five-sum", opt, stakeValue);
                        }}
                        className="relative rounded-lg border border-white/15 bg-slate-950/60 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-white/30"
                        disabled={busy}
                      >
                        {opt === "over" ? "Over 122.5" : "Under 122.5"}
                        {renderBadge(betAmountFor("first-five-sum", opt))}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-inner shadow-black/30 space-y-3">
                <div>
                  <div className="text-sm font-semibold text-white">First ball color</div>
                  <div className="text-xs text-slate-400">Pick the color of the first ball.</div>
                </div>
                <div className="grid grid-cols-8 gap-2">
                  {LUCKY6_COLORS.map((c) => {
                    const meta = colorMeta[c];
                    const active = pendingBets.some((b) => b.type === "first-color" && b.pick === c);
                    return (
                      <button
                        key={`first-${c}`}
                        type="button"
                        onClick={() => toggleFirstColor(c)}
                        disabled={busy}
                        className={clsx(
                          "relative h-7 w-7 justify-self-center rounded-full border transition",
                          active
                            ? "border-white/80 ring-2 ring-white/60 ring-offset-2 ring-offset-slate-900"
                            : "border-white/30",
                          meta.text
                        )}
                        style={{ backgroundColor: meta.bg }}
                        title={`First ball ${c}`}
                      >
                        {renderBadge(betAmountFor("first-color", c), "left-1/2 -top-2 -translate-x-1/2 -translate-y-1/2")}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-inner shadow-black/30 space-y-3">
                <div>
                  <div className="text-sm font-semibold text-white">Combo builder</div>
                  <div className="text-xs text-slate-400">Select any 6 numbers (max 6).</div>
                </div>
                <div className="grid grid-cols-8 gap-2 rounded-xl border border-white/5 bg-slate-950/50 p-3">
                  {Array.from({ length: 48 }, (_, i) => i + 1).map((num) => {
                    const color = colorForNumber(num);
                    const meta = colorMeta[color];
                    const isSelected = comboSelection.includes(num);
                    return (
                      <button
                        key={num}
                        onClick={() => toggleComboNumber(num)}
                        className={clsx(
                          "relative flex h-10 items-center justify-center rounded-lg border text-sm font-semibold transition",
                          isSelected
                            ? "ring-2 ring-white/70 ring-offset-2 ring-offset-slate-900 border-white/40"
                            : "border-white/15",
                          meta.text
                        )}
                        title={`Number ${num} (${color})`}
                        disabled={busy}
                        style={{ backgroundColor: meta.bg }}
                      >
                        <span
                          className={clsx("text-[0.75rem] font-extrabold", meta.text)}
                          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}
                        >
                          {num}
                        </span>
                        {isSelected && renderBadge(stakeValue)}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-8 gap-2">
                  {Array.from({ length: 8 }, (_, col) => {
                    const columnNumber = col + 1;
                    const color = colorForNumber(columnNumber);
                    const meta = colorMeta[color];
                    const columnNumbers = Array.from({ length: 6 }, (_, row) => columnNumber + row * 8);
                    const isColumnSelected =
                      comboSelection.length === columnNumbers.length &&
                      comboSelection.every((n) => columnNumbers.includes(n));
                    return (
                      <button
                        key={`col-${columnNumber}`}
                        type="button"
                        onClick={() => toggleColumnSelection(col)}
                        className={clsx(
                          "h-6 w-6 justify-self-center rounded-full border transition",
                          isColumnSelected ? "border-white/80 ring-2 ring-white/60 ring-offset-2 ring-offset-slate-900" : "border-white/30",
                          meta.text
                        )}
                        style={{ backgroundColor: meta.bg }}
                        title={`Select ${color} column`}
                        disabled={busy}
                      />
                    );
                  })}
                </div>
                <div className="space-y-2 text-left">
                  <label className="text-xs uppercase tracking-wide text-slate-400">Selected numbers</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex-1 flex flex-wrap gap-2 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-300">
                      {comboSelection.length === 0 ? (
                        <span className="text-slate-500">Select up to 6 numbers</span>
                      ) : (
                        [...comboSelection]
                          .sort((a, b) => a - b)
                          .map((num) => {
                            const color = colorForNumber(num);
                            const meta = colorMeta[color];
                            return (
                              <span
                                key={`combo-pill-${num}`}
                                className={clsx(
                                  "inline-flex items-center justify-center rounded-full border border-white/20 px-2 py-1 text-xs font-semibold",
                                  meta.text
                                )}
                                style={{ backgroundColor: meta.bg }}
                              >
                                {num}
                              </span>
                            );
                          })
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={addComboBet}
                      disabled={busy || comboSelection.length !== 6 || comboAlreadyAdded}
                      className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-white/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Add bet
                    </button>
                  </div>
                  {comboAlreadyAdded && (
                    <div className="text-xs text-rose-300">
                      This combination of numbers is already added to your bets.
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-center">
                <div className="text-sm text-slate-300">Total stake: {usd.format(totalStakePreview)}</div>
                <div className="flex items-center justify-center">
                  <button
                    onClick={play}
                    disabled={busy || isDrawing || pendingBets.length === 0}
                    className="w-full max-w-sm rounded-xl bg-[#c5305f] px-6 py-3 text-lg font-semibold text-white transition hover:bg-[#a61a42] disabled:cursor-not-allowed disabled:bg-[#c5305f]/50"
                  >
                    {isDrawing ? "Round in progress" : busy ? "Playing..." : "Play Lucky 6"}
                  </button>
                </div>
              </div>

              {error && <div className="text-sm text-red-400">{error}</div>}
            </div>

            <div className="space-y-4">
              {lastResult && (
                <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-xl shadow-black/30">
                  <div className="flex items-center justify-between text-sm text-slate-300">
                    <div className="font-semibold text-white">Last draw</div>
                    {!isDrawing && (
                      <div>
                        Stake {usd.format(lastResult.totals.stake)} | Payout {usd.format(lastResult.totals.payout)} |{" "}
                        <span
                          className={clsx(
                            "font-semibold",
                            lastResult.totals.payout - lastResult.totals.stake > 0
                              ? "text-emerald-400"
                              : lastResult.totals.payout - lastResult.totals.stake < 0
                              ? "text-rose-400"
                              : "text-white"
                          )}
                        >
                          Win/Loss{" "}
                          {formatSignedUsd(lastResult.totals.payout - lastResult.totals.stake)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-4">
                    {isDrawing &&
                      (() => {
                        const nextBall =
                          revealedCount < lastResult.draw.balls.length
                            ? lastResult.draw.balls[revealedCount]
                            : lastResult.draw.balls[lastResult.draw.balls.length - 1];
                        const nextMeta = nextBall ? colorMeta[nextBall.color] : null;
                        return (
                          <div className="tumbler">
                            <div className={clsx("tumbler__ring", !isDrawing && "tumbler__ring--still")} />
                            {nextBall && nextMeta && (
                              <div
                                key={`draw-${revealedCount}-${nextBall.number}`}
                                className={clsx("tumbler__ball", "ring-1", nextMeta.ring)}
                                style={{ backgroundColor: nextMeta.bg }}
                                title={`Drawing ${nextBall.number} (${nextBall.color})`}
                              >
                                <span className="ball__number">{nextBall.number}</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    <div className="grid w-full max-w-[420px] grid-cols-5 justify-items-center gap-x-4 gap-y-3">
                      {Array.from({ length: drawSlots }, (_, slotIdx) => {
                        const ball = slotIdx < revealedCount ? lastResult.draw.balls[slotIdx] : null;
                        const completionPosition = slotIdx + 1;
                        const quotaIndex = completionPosition - 6;
                        const quota =
                          quotaIndex >= 0 && quotaIndex < comboCompletionPayouts.length
                            ? comboCompletionPayouts[quotaIndex]
                            : null;
                        if (!ball) {
                          return (
                            <div key={`slot-${slotIdx}`} className="flex min-w-[74px] items-center gap-2">
                              <div className="ball ball--sm ball--ghost" />
                              <span
                                className={clsx(
                                  "text-xs font-semibold tabular-nums",
                                  quota ? "text-slate-400" : "text-transparent"
                                )}
                              >
                                {quota ? formatQuota(quota) : "0"}
                              </span>
                            </div>
                          );
                        }
                        const meta = colorMeta[ball.color];
                        return (
                          <div
                            key={`revealed-${slotIdx}`}
                            className="flex min-w-[74px] items-center gap-2"
                          >
                            <div
                              className={clsx("ball ball--sm", "ring-1", meta.ring)}
                              style={{ backgroundColor: meta.bg }}
                              title={`#${slotIdx + 1} - ${ball.number} (${ball.color})`}
                            >
                              <span className="ball__number text-[0.75rem]">{ball.number}</span>
                            </div>
                            <span
                              className={clsx(
                                "text-xs font-semibold tabular-nums",
                                quota ? "text-slate-300" : "text-transparent"
                              )}
                            >
                              {quota ? formatQuota(quota) : "0"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {!isDrawing && (
                    <div className="space-y-2 text-sm text-slate-200">
                      <div className="font-semibold">Bets</div>
                      <div className="space-y-2">
                        {lastResult.bets.map((bet, idx) => {
                          const winLoss = bet.payout - bet.amount;
                          return (
                            <div key={idx} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-200">
                              <span className="font-semibold">{friendlyBetLabel(bet)}</span>
                              <span className="text-xs text-slate-300">
                                Stake {usd.format(bet.amount)} | Payout {usd.format(bet.payout)} |{" "}
                                <span
                                  className={clsx(
                                    "font-semibold",
                                    winLoss > 0 ? "text-emerald-400" : winLoss < 0 ? "text-rose-400" : "text-white"
                                  )}
                                >
                                  Win/Loss {formatSignedUsd(winLoss)}
                                </span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex h-[320px] flex-col space-y-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-inner shadow-black/20">
                <div className="flex items-center justify-between text-sm text-slate-200">
                  <div className="font-semibold">Current bets</div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={clearAllBets}
                      className="rounded-md border border-white/15 px-3 py-1 text-xs text-slate-200 hover:border-white/40"
                    >
                      Clear all bets
                    </button>
                  </div>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                  {pendingBets.length === 0 && <div className="text-sm text-slate-400">No bets added.</div>}
                  {pendingBets.map((bet, idx) => (
                    <div
                      key={`${bet.type}-${bet.pick}-${idx}`}
                      className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-200"
                    >
                      <span className="font-semibold">{friendlyBetLabel(bet as Lucky6BetResponse)}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{usd.format(bet.amount)}</span>
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
    color: #ffffff;
    text-shadow: 0 1px 2px rgba(0,0,0,0.9), 0 0 1px rgba(0,0,0,0.9);
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
    width: 30px;
    height: 30px;
  }
  .ball--sm .ball__number {
    font-size: 0.7rem;
  }
  .ball--ghost {
    background: rgba(15, 23, 42, 0.35);
    border: 1px dashed rgba(255, 255, 255, 0.18);
  }
  .tumbler {
    position: relative;
    width: 140px;
    height: 140px;
    border-radius: 9999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.12), rgba(2,6,23,0.9) 60%);
    box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .tumbler__ring {
    position: absolute;
    inset: 8px;
    border-radius: 9999px;
    border: 2px dashed rgba(255, 255, 255, 0.25);
    animation: tumble-spin 1.2s linear infinite;
  }
  .tumbler__ring--still {
    animation: none;
    opacity: 0.4;
  }
  .tumbler__ball {
    position: absolute;
    width: 36px;
    height: 36px;
    border-radius: 9999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    animation: ball-drop 0.45s ease-out;
  }
  @keyframes tumble-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes ball-drop {
    0% {
      transform: translateY(-28px) scale(0.9);
      opacity: 0;
    }
    100% {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
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
  const [pendingBets, setPendingBets] = useState<
    Array<{ type: Lucky6BetResponse["type"]; pick: string; amount: number }>
  >([]);

  function toggleBet(type: Lucky6BetResponse["type"], pick: string, amount: number) {
    setPendingBets((prev) => {
      const idx = prev.findIndex((b) => b.type === type && b.pick === pick);
      if (idx !== -1) {
        return prev.filter((_, i) => i !== idx);
      }
      return [...prev, { type, pick, amount }];
    });
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
