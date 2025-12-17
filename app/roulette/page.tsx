"use client";

import React, { useEffect, useState } from "react";
import DashboardShell from "@/components/DashboardShell";
import clsx from "clsx";
import { AMERICAN_WHEEL, RED_NUMBERS, type RouletteValue } from "@/lib/roulette";

type ApiResponse =
  | {
      ok: true;
      spin: RouletteValue;
      payouts: number[];
      totalPayout: number;
      totalStake: number;
      wallet: { balance: string; held: string };
    }
  | { error: string };

type BetInput = {
  type: string;
  pick: any;
  amount: string;
};

const redSet = RED_NUMBERS;
const wheelValues = AMERICAN_WHEEL;

export default function RoulettePage() {
  const [bets, setBets] = useState<BetInput[]>([]);
  const [amount, setAmount] = useState("5.00");
  const [splitInput, setSplitInput] = useState("");
  const [cornerInput, setCornerInput] = useState("");
  const [result, setResult] = useState<{
    spin: RouletteValue;
    totalPayout: number;
    totalStake: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [hoverPicks, setHoverPicks] = useState<number[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  function addBet(bet: BetInput) {
    setBets((prev) => {
      const isSamePick = (a: any, b: any) =>
        Array.isArray(a) && Array.isArray(b)
          ? JSON.stringify(a) === JSON.stringify(b)
          : a === b;
      const idx = prev.findIndex((b) => b.type === bet.type && isSamePick(b.pick, bet.pick));
      if (idx !== -1) {
        // toggle off
        return prev.filter((_, i) => i !== idx);
      }
      return [...prev, bet];
    });
  }

  function clearBets() {
    setBets([]);
    setResult(null);
    setError(null);
  }

  async function spin() {
    if (bets.length === 0) {
      setError("Add at least one bet.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);

    const payload = {
      bets: bets.map((b) => ({
        type: b.type,
        pick: b.pick,
        amount: Number(b.amount),
      })),
    };

    try {
      const res = await fetch("/api/games/roulette", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok || (json as any).ok !== true) {
        setError((json as any)?.error ?? "Spin failed");
      } else {
        const ok = json as Extract<ApiResponse, { ok: true }>;
        const slice = 360 / wheelValues.length;
        const idx = wheelValues.findIndex((v) => v === ok.spin);
        const spins = 12; // more rotations for visual spin
        const angleCenter = idx * slice + slice / 2; // slice center angle
        const baseOffset = -90; // put 0deg at 12 o'clock
        const currentMod = ((rotation % 360) + 360) % 360;
        const desired = baseOffset - angleCenter;
        const delta = desired - currentMod + spins * 360;
        setRotation(rotation + delta);
        setResult({
          spin: ok.spin,
          totalPayout: ok.totalPayout,
          totalStake: ok.totalStake,
        });
        window.dispatchEvent(new Event("wallet:update"));
      }
    } catch (e) {
      console.error(e);
      setError("Spin failed");
    } finally {
      setBusy(false);
    }
  }

  const totalStake = bets.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  const betTotal = (type: string, pick: any) =>
    bets.reduce((sum, b) => {
      if (b.type !== type) return sum;
      const samePick = Array.isArray(pick)
        ? JSON.stringify(b.pick) === JSON.stringify(pick)
        : b.pick === pick;
      return samePick ? sum + Number(b.amount || 0) : sum;
    }, 0);
  const renderMarkerBadge = (value: number, extra?: string) =>
    value > 0 ? (
      <span
        className={clsx(
          "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30 bg-[#c5305f] px-2 py-[2px] text-[10px] font-semibold text-white shadow shadow-black/40 z-30",
          extra
        )}
      >
        ${value.toFixed(2)}
      </span>
    ) : null;
  const hasBet = (type: string, pick: any) =>
    bets.some((b) => b.type === type && (Array.isArray(pick) ? JSON.stringify(b.pick) === JSON.stringify(pick) : b.pick === pick));
  const renderChip = (value: number) =>
    value > 0 ? (
      <span className="pointer-events-none absolute left-1/2 top-1/2 inline-flex min-w-[32px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-[#c5305f] px-2 py-1 text-[11px] font-semibold text-white shadow-lg shadow-black/40">
        ${value.toFixed(2)}
      </span>
    ) : null;

  const renderValue = (val: RouletteValue) => (val === "00" ? "00" : val);
  const isRed = (val: RouletteValue) => typeof val === "number" && redSet.has(val);
  const isHovered = (val: RouletteValue) => typeof val === "number" && hoverPicks.includes(val);
  const boardRows = Array.from({ length: 12 }, (_, idx) => {
    const r = 12 - idx;
    const rawRow = [r * 3, r * 3 - 1, r * 3 - 2];
    return rawRow.map((n) => (37 - n) as RouletteValue);
  });
  const formatBet = (bet: BetInput) => {
    const amt = `$${Number(bet.amount || 0).toFixed(2)}`;
    switch (bet.type) {
      case "color":
        return `${amt} on ${bet.pick === "red" ? "red" : "black"}`;
      case "parity":
        return `${amt} on ${bet.pick === "even" ? "even" : "odd"}`;
      case "range":
        return `${amt} on ${bet.pick === "high" ? "19-36" : "1-18"}`;
      case "column": {
        // Mapping now aligns picks directly: 1 -> 1st, 2 -> 2nd, 3 -> 3rd
        const label = bet.pick === 1 ? "1st column" : bet.pick === 2 ? "2nd column" : "3rd column";
        return `${amt} on ${label}`;
      }
      case "dozen": {
        const label = bet.pick === 1 ? "1-12" : bet.pick === 2 ? "13-24" : "25-36";
        return `${amt} on ${label}`;
      }
      case "split":
        return `${amt} on split ${Array.isArray(bet.pick) ? bet.pick.join(",") : bet.pick}`;
      case "corner":
        return `${amt} on corner ${Array.isArray(bet.pick) ? bet.pick.join(",") : bet.pick}`;
      case "straight":
      default:
        return `${amt} on ${Array.isArray(bet.pick) ? bet.pick.join(",") : bet.pick}`;
    }
  };
  const allNumbers = boardRows.flat().filter((v) => typeof v === "number") as number[];
  const hoverSets = {
    color: {
      red: allNumbers.filter((n) => redSet.has(n)),
      black: allNumbers.filter((n) => !redSet.has(n)),
    },
    parity: {
      even: allNumbers.filter((n) => n % 2 === 0),
      odd: allNumbers.filter((n) => n % 2 === 1),
    },
    range: {
      low: allNumbers.filter((n) => n >= 1 && n <= 18),
      high: allNumbers.filter((n) => n >= 19 && n <= 36),
    },
    dozen: {
      1: allNumbers.filter((n) => n >= 1 && n <= 12),
      2: allNumbers.filter((n) => n >= 13 && n <= 24),
      3: allNumbers.filter((n) => n >= 25 && n <= 36),
    },
    column: {
      1: allNumbers.filter((n) => n % 3 === 0), // 1st visual column now maps to logical column 3
      2: allNumbers.filter((n) => n % 3 === 2),
      3: allNumbers.filter((n) => n % 3 === 1),
    },
  };
  const columnHoverMap: Record<1 | 2 | 3, 1 | 2 | 3> = { 1: 3, 2: 2, 3: 1 };
  const slice = 360 / wheelValues.length;
  const wheelStops = wheelValues.map((val, idx) => ({
    color: val === 0 || val === "00" ? "#16a34a" : isRed(val) ? "#c5305f" : "#0f172a",
    start: idx * slice,
    end: (idx + 1) * slice,
    val,
    idx,
  }));

  const slicePath = (startDeg: number, endDeg: number, outer = 49, inner = 32) => {
    const toRad = (d: number) => (Math.PI / 180) * d;
    const sx = 50 + outer * Math.cos(toRad(startDeg));
    const sy = 50 + outer * Math.sin(toRad(startDeg));
    const ex = 50 + outer * Math.cos(toRad(endDeg));
    const ey = 50 + outer * Math.sin(toRad(endDeg));
    const sxi = 50 + inner * Math.cos(toRad(endDeg));
    const syi = 50 + inner * Math.sin(toRad(endDeg));
    const exi = 50 + inner * Math.cos(toRad(startDeg));
    const eyi = 50 + inner * Math.sin(toRad(startDeg));
    const largeArc = endDeg - startDeg <= 180 ? "0" : "1";
    return `M ${sx} ${sy} A ${outer} ${outer} 0 ${largeArc} 1 ${ex} ${ey} L ${sxi} ${syi} A ${inner} ${inner} 0 ${largeArc} 0 ${exi} ${eyi} Z`;
  };

  return (
    <DashboardShell title="Roulette" description="Place your bets and spin the wheel.">
      <div className="mx-auto max-w-6xl space-y-5 text-center">
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-lg shadow-black/40">
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-slate-200">
            <div className="flex items-center gap-2">
              <label className="text-xs uppercase tracking-wide text-slate-400">Chip amount (USD)</label>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-28 rounded border border-white/20 bg-slate-950/70 px-3 py-2 text-sm text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30"
              />
            </div>
          </div>
          <div className="grid gap-5 items-start lg:grid-cols-[430px_1fr]">
            <div className="flex flex-col items-center justify-start">
              <div
                className="grid w-fit gap-[5px] rounded-xl border border-white/10 bg-gradient-to-br from-[#0b3b1c] to-[#0f2f1c] p-4"
                style={{ gridTemplateColumns: "72px 72px repeat(3,74px)", gridTemplateRows: "46px repeat(12,46px) 55px" }}
              >
                {/* 0 spanning top across number columns */}
                <div className="relative col-start-3 col-span-3 row-start-1 flex items-center justify-center">
                  <button
                    onClick={() => addBet({ type: "straight", pick: 0, amount })}
                    className={clsx(
                      "relative w-full rounded-lg border border-white/20 bg-green-700/80 px-3 py-3 text-sm font-semibold text-white hover:border-white/80",
                      isHovered(0) && "ring-2 ring-white/80 ring-offset-2 ring-offset-slate-900"
                    )}
                    disabled={busy}
                  >
                    {renderChip(betTotal("straight", 0))}
                    0
                  </button>
                </div>

                {/* number grid */}
                {boardRows.map((row, rIdx) =>
                  row.map((val, cIdx) => {
                    const red = isRed(val);
                    const green = val === 0 || val === "00";
                    const rightVal = row[cIdx + 1];
                    const belowVal = boardRows[rIdx + 1]?.[cIdx];
                    const diagVal = boardRows[rIdx + 1]?.[cIdx + 1];
                    return (
                      <button
                        key={`${val}`}
                        onClick={() =>
                          addBet({
                            type: "straight",
                            pick: val,
                            amount,
                          })
                        }
                        className={clsx(
                          "relative rounded-md border border-white/10 text-sm font-semibold text-white transition",
                          red
                            ? "bg-gradient-to-br from-[#c5305f] to-[#8b1d3c]"
                            : green
                            ? "bg-green-700/80"
                            : "bg-gradient-to-br from-[#0f172a] to-[#1f2937]",
                          "hover:border-white/80",
                          isHovered(val) && "ring-2 ring-white/80 ring-offset-2 ring-offset-slate-900"
                        )}
                        style={{ gridColumn: 3 + cIdx, gridRow: rIdx + 2 }}
                        disabled={busy}
                      >
                        {rIdx === 0 && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              addBet({ type: "split", pick: [0, val], amount });
                            }}
                            className="absolute left-1/2 -top-1 h-2 w-2 -translate-x-1/2 -translate-y-1/2 border border-white/30 bg-white/50 shadow shadow-white/30 z-10 cursor-pointer transition hover:border-black/80"
                            title={`Split 0 & ${renderValue(val)}`}
                            onMouseEnter={() => setHoverPicks([0, val as number])}
                            onMouseLeave={() => setHoverPicks([])}
                          />
                        )}
                        {rIdx === 0 && renderMarkerBadge(betTotal("split", [0, val]), "left-1/2 -top-1 -translate-x-1/2 -translate-y-1/2")}
                        {renderChip(betTotal("straight", val))}
                        {/* Action squares to place splits/corners */}
                        {rightVal !== undefined && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              addBet({ type: "split", pick: [val, rightVal as number], amount });
                            }}
                            className="absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 translate-x-1/2 border border-white/30 bg-white/50 shadow shadow-white/30 z-10 cursor-pointer transition hover:border-black/80"
                            title={`Split ${renderValue(val)} & ${renderValue(rightVal)}`}
                            onMouseEnter={() => setHoverPicks([val as number, rightVal as number])}
                            onMouseLeave={() => setHoverPicks([])}
                          />
                        )}
                        {rightVal !== undefined &&
                          renderMarkerBadge(
                            betTotal("split", [val, rightVal]),
                            "-right-1 top-1/2 translate-x-1/2 -translate-y-1/2"
                          )}
                        {belowVal !== undefined && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              addBet({ type: "split", pick: [val, belowVal as number], amount });
                            }}
                            className="absolute left-1/2 -bottom-1 h-2 w-2 -translate-x-1/2 translate-y-1/2 border border-white/30 bg-white/50 shadow shadow-white/30 z-10 cursor-pointer transition hover:border-black/80"
                            title={`Split ${renderValue(val)} & ${renderValue(belowVal)}`}
                            onMouseEnter={() => setHoverPicks([val as number, belowVal as number])}
                            onMouseLeave={() => setHoverPicks([])}
                          />
                        )}
                        {belowVal !== undefined &&
                          renderMarkerBadge(
                            betTotal("split", [val, belowVal]),
                            "left-1/2 -bottom-1 -translate-x-1/2 translate-y-1/2"
                          )}
                        {rightVal !== undefined && diagVal !== undefined && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              addBet({ type: "corner", pick: [val, rightVal as number, belowVal as number, diagVal as number], amount });
                            }}
                            className="absolute -right-1 -bottom-1 h-2 w-2 translate-x-1/2 translate-y-1/2 border border-white/30 bg-white/50 shadow shadow-white/30 z-10 cursor-pointer transition hover:border-black/80"
                            title={`Corner ${renderValue(val)}, ${renderValue(rightVal)}, ${renderValue(belowVal)}, ${renderValue(diagVal)}`}
                            onMouseEnter={() => setHoverPicks([val as number, rightVal as number, belowVal as number, diagVal as number])}
                            onMouseLeave={() => setHoverPicks([])}
                          />
                        )}
                        {rightVal !== undefined &&
                          diagVal !== undefined &&
                          renderMarkerBadge(
                            betTotal("corner", [val, rightVal, belowVal as number, diagVal]),
                            "-right-1 -bottom-1 translate-x-1/2 translate-y-1/2"
                          )}

                        {renderValue(val)}
                      </button>
                    );
                  })
                )}

                {/* columns bottom */}
                {[1, 2, 3].map((c) => (
                  <button
                    key={`col-btn-${c}`}
                    onClick={() =>
                      addBet({
                        type: "column",
                        pick: c as 1 | 2 | 3,
                        amount,
                      })
                    }
                    className="relative rounded-md border border-white/20 bg-green-800/70 py-2 text-xs font-semibold text-white hover:border-white/80"
                    style={{ gridColumn: 2 + c, gridRow: 14 }}
                    disabled={busy}
                    onMouseEnter={() => setHoverPicks(hoverSets.column[columnHoverMap[c as 1 | 2 | 3]])}
                    onMouseLeave={() => setHoverPicks([])}
                  >
                    {renderChip(betTotal("column", c as 1 | 2 | 3))}
                    {c === 1 ? "1st" : c === 2 ? "2nd" : "3rd"}
                  </button>
                ))}

                {/* dozens in second column */}
                <button
                  onClick={() => addBet({ type: "dozen", pick: 3, amount })}
                  className="relative rounded-md border border-white/20 bg-green-800/70 px-2 py-2 text-xs font-semibold text-white hover:border-white/80"
                  style={{ gridColumn: 2, gridRow: "10 / span 4" }}
                  disabled={busy}
                  onMouseEnter={() => setHoverPicks(hoverSets.dozen[3])}
                  onMouseLeave={() => setHoverPicks([])}
                >
                  {renderChip(betTotal("dozen", 3))}
                  25 to 36
                </button>
                <button
                  onClick={() => addBet({ type: "dozen", pick: 2, amount })}
                  className="relative rounded-md border border-white/20 bg-green-800/70 px-2 py-2 text-xs font-semibold text-white hover:border-white/80"
                  style={{ gridColumn: 2, gridRow: "6 / span 4" }}
                  disabled={busy}
                  onMouseEnter={() => setHoverPicks(hoverSets.dozen[2])}
                  onMouseLeave={() => setHoverPicks([])}
                >
                  {renderChip(betTotal("dozen", 2))}
                  13 to 24
                </button>
                <button
                  onClick={() => addBet({ type: "dozen", pick: 1, amount })}
                  className="relative rounded-md border border-white/20 bg-green-800/70 px-2 py-2 text-xs font-semibold text-white hover:border-white/80"
                  style={{ gridColumn: 2, gridRow: "2 / span 4" }}
                  disabled={busy}
                  onMouseEnter={() => setHoverPicks(hoverSets.dozen[1])}
                  onMouseLeave={() => setHoverPicks([])}
                >
                  {renderChip(betTotal("dozen", 1))}
                  1 to 12
                </button>

                {/* left-side outside bets */}
                <button
                  onClick={() => addBet({ type: "range", pick: "low", amount })}
                  className="relative rounded-md border border-white/20 bg-green-800/70 px-2 py-2 text-xs font-semibold text-white hover:border-white/80"
                  style={{ gridColumn: 1, gridRow: "2 / span 3" }}
                  disabled={busy}
                  onMouseEnter={() => setHoverPicks(hoverSets.range.low)}
                  onMouseLeave={() => setHoverPicks([])}
                >
                  {renderChip(betTotal("range", "low"))}
                  1 to 18
                </button>
                <button
                  onClick={() => addBet({ type: "parity", pick: "even", amount })}
                  className="relative rounded-md border border-white/20 bg-green-800/70 px-2 py-2 text-xs font-semibold text-white hover:border-white/80"
                  style={{ gridColumn: 1, gridRow: "5 / span 2" }}
                  disabled={busy}
                  onMouseEnter={() => setHoverPicks(hoverSets.parity.even)}
                  onMouseLeave={() => setHoverPicks([])}
                >
                  {renderChip(betTotal("parity", "even"))}
                  EVEN
                </button>
                <button
                  onClick={() => addBet({ type: "color", pick: "red", amount })}
                  className="relative rounded-md border border-white/20 bg-gradient-to-br from-[#c5305f] to-[#8b1d3c] px-2 py-2 text-xs font-semibold text-white hover:border-white/80"
                  style={{ gridColumn: 1, gridRow: 7 }}
                  disabled={busy}
                  onMouseEnter={() => setHoverPicks(hoverSets.color.red)}
                  onMouseLeave={() => setHoverPicks([])}
                >
                  {renderChip(betTotal("color", "red"))}
                  RED
                </button>
                <button
                  onClick={() => addBet({ type: "color", pick: "black", amount })}
                  className="relative rounded-md border border-white/20 bg-gradient-to-br from-[#0f172a] to-[#1f2937] px-2 py-2 text-xs font-semibold text-white hover:border-white/80"
                  style={{ gridColumn: 1, gridRow: 8 }}
                  disabled={busy}
                  onMouseEnter={() => setHoverPicks(hoverSets.color.black)}
                  onMouseLeave={() => setHoverPicks([])}
                >
                  {renderChip(betTotal("color", "black"))}
                  BLACK
                </button>
                <button
                  onClick={() => addBet({ type: "parity", pick: "odd", amount })}
                  className="relative rounded-md border border-white/20 bg-green-800/70 px-2 py-2 text-xs font-semibold text-white hover:border-white/80"
                  style={{ gridColumn: 1, gridRow: "9 / span 2" }}
                  disabled={busy}
                  onMouseEnter={() => setHoverPicks(hoverSets.parity.odd)}
                  onMouseLeave={() => setHoverPicks([])}
                >
                  {renderChip(betTotal("parity", "odd"))}
                  ODD
                </button>
                <button
                  onClick={() => addBet({ type: "range", pick: "high", amount })}
                  className="relative rounded-md border border-white/20 bg-green-800/70 px-2 py-2 text-xs font-semibold text-white hover:border-white/80"
                  style={{ gridColumn: 1, gridRow: "11 / span 3" }}
                  disabled={busy}
                  onMouseEnter={() => setHoverPicks(hoverSets.range.high)}
                  onMouseLeave={() => setHoverPicks([])}
                >
                  {renderChip(betTotal("range", "high"))}
                  19 to 36
                </button>
              </div>
            </div>

              <div className="grid gap-4">
              <div className="rounded-xl border border-white/10 bg-slate-900/80 p-6 shadow-lg shadow-black/30">
                <div className="wheel-container mx-auto h-[368px] w-[368px] rounded-full border border-white/10 bg-slate-950/70 shadow-inner shadow-black/30">
                  {mounted ? (
                    <div className="wheel" style={{ transform: `rotate(${rotation}deg)` }}>
                      <svg viewBox="0 0 100 100" className="wheel__svg">
                        {wheelStops.map((s) => (
                          <path key={`p-${s.idx}`} d={slicePath(s.start, s.end)} fill={s.color} stroke="rgba(255,255,255,0.06)" strokeWidth="0.35" />
                        ))}
                        {wheelStops.map((s) => {
                          const mid = (s.start + s.end) / 2;
                          const rad = (mid * Math.PI) / 180;
                          const radius = 43;
                          const x = 50 + radius * Math.cos(rad);
                          const y = 50 + radius * Math.sin(rad);
                          return (
                            <text
                              key={`t-${s.idx}`}
                              x={x}
                              y={y}
                              fill="#fff"
                              fontSize="4.6"
                              fontWeight="700"
                              textAnchor="middle"
                              dominantBaseline="middle"
                              transform={`rotate(${mid + 90}, ${x}, ${y})`}
                              style={{ textShadow: "0 0 2px rgba(0,0,0,0.9)" }}
                            >
                              {renderValue(s.val)}
                            </text>
                          );
                        })}
                        <circle cx="50" cy="50" r="27" fill="url(#hub)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
                        <defs>
                          <radialGradient id="hub">
                            <stop offset="0%" stopColor="#1f2937" />
                            <stop offset="100%" stopColor="#0b1226" />
                          </radialGradient>
                        </defs>
                      </svg>
                    </div>
                  ) : (
                    <div className="wheel placeholder" />
                  )}
                  <div className="wheel__marker" />
                </div>
                {error && <div className="mt-2 text-sm text-red-300 text-center">{error}</div>}
                {result && (
                  <div className="mt-3 space-y-1 text-sm text-slate-200 text-center">
                    <div>
                      Result: <span className="font-semibold">{renderValue(result.spin)}</span>
                    </div>
                    <div>Total stake: ${result.totalStake.toFixed(2)}</div>
                    <div className={result.totalPayout > 0 ? "text-emerald-300" : "text-slate-400"}>
                      Payout: ${result.totalPayout.toFixed(2)}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-center gap-3 text-sm text-slate-200">
                  <div>Total stake: ${totalStake.toFixed(2)}</div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={clearBets}
                      className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-white/80 hover:text-white"
                      disabled={busy}
                    >
                      Clear
                    </button>
                    <button
                      onClick={spin}
                      disabled={busy || bets.length === 0}
                      className="rounded-lg bg-[#c5305f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a61a42] disabled:cursor-not-allowed disabled:bg-[#c5305f]/50"
                    >
                      {busy ? "Spinning..." : "Spin"}
                    </button>
                  </div>
                </div>

              </div>

              <div className="rounded-lg border border-white/10 bg-slate-950/60 p-4 text-left">
                <h3 className="text-sm font-semibold text-slate-200 mb-2 text-center">Current bets</h3>
                {bets.length === 0 ? (
                  <div className="text-sm text-slate-400 text-center">No bets added.</div>
                ) : (
                  <div className="space-y-2">
                    {bets.map((b, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-200"
                      >
                        <span>{formatBet(b)}</span>
                        <button
                          onClick={() => setBets((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-xs text-slate-400 hover:text-white"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/50 p-4 text-left text-xs text-slate-400 space-y-1">
            <div className="font-semibold text-slate-200">Payouts</div>
            <div>Straight: 35:1</div>
            <div>Split: 17:1</div>
            <div>Corner: 8:1</div>
            <div>Column / Dozen: 2:1</div>
            <div>Even-money (color, odd/even, 1-18, 19-36): 1:1</div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .wheel-container {
          position: relative;
          overflow: hidden;
        }
        .wheel {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          transform: rotate(0deg);
          transition: transform 2.2s cubic-bezier(0.22, 0.61, 0.36, 1);
          overflow: hidden;
          border: 8px solid rgba(255, 255, 255, 0.15);
          background-color: #0b1226;
        }
        .wheel.placeholder {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.06), transparent 60%), #0b1226;
          border: 8px solid rgba(255, 255, 255, 0.15);
        }
        .wheel__svg {
          width: 100%;
          height: 100%;
        }
        .wheel__marker {
          position: absolute;
          top: -6px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 8px solid transparent;
          border-right: 8px solid transparent;
          border-bottom: 14px solid #facc15;
          z-index: 10;
        }
      `}</style>
    </DashboardShell>
  );
}
