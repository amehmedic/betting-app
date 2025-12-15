"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import clsx from "clsx";

type Wallet = {
  id: string;
  currency: string;
  balance: string; // serialized BigInt
  held: string; // serialized BigInt
};

type Ledger = {
  id: string;
  amount: string; // serialized BigInt
  kind: string;
  createdAt: string;
};

function notifyWalletUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("wallet:update"));
  }
}

const QUICK_DEPOSIT_AMOUNTS = [1, 5, 10, 25, 50, 100];
type Panel = "add" | "withdraw" | "transactions";

const PANEL_OPTIONS: { id: Panel; label: string; helper: string }[] = [
  { id: "add", label: "Add funds", helper: "Top up your bankroll instantly." },
  { id: "withdraw", label: "Withdraw funds", helper: "Move winnings back to cash." },
  { id: "transactions", label: "Transactions", helper: "Review your latest ledger entries." },
];

export default function WalletPage() {
  const router = useRouter();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const [depositing, setDepositing] = useState(false);
  const [customAmount, setCustomAmount] = useState("25.00");
  const [withdrawing, setWithdrawing] = useState(false);
  const [customWithdrawAmount, setCustomWithdrawAmount] = useState("10.00");
  const [activePanel, setActivePanel] = useState<Panel>("add");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/wallet", { cache: "no-store" });
    if (res.status === 401) {
      setLoading(false);
      router.replace("/login?callback=/wallet");
      return;
    }

    if (res.ok) {
      const json = await res.json();
      setWallet(json.wallet);
      setLedger(json.ledger);
      notifyWalletUpdate();
    } else {
      alert("Failed to load wallet (are you logged in?)");
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function deposit(amountDollars: number) {
    setDepositing(true);
    const res = await fetch("/api/wallet/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amountDollars }), // dollars
    });
    if (res.status === 401) {
      setDepositing(false);
      router.replace("/login?callback=/wallet");
      return;
    }
    setDepositing(false);
    if (res.ok) {
      await load();
      notifyWalletUpdate();
    } else {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Deposit failed");
    }
  }

  const parsedCustomAmount = customAmount.trim() === "" ? NaN : Number(customAmount);
  const customAmountValid =
    Number.isFinite(parsedCustomAmount) && parsedCustomAmount >= 1 && parsedCustomAmount <= 200;

  async function depositCustom() {
    if (!customAmountValid) {
      alert("Enter an amount between $1.00 and $200.00");
      return;
    }
    await deposit(parsedCustomAmount);
  }

  async function withdraw(amountDollars: number) {
    setWithdrawing(true);
    const res = await fetch("/api/wallet/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amountDollars }), // dollars
    });
    if (res.status === 401) {
      setWithdrawing(false);
      router.replace("/login?callback=/wallet");
      return;
    }
    setWithdrawing(false);
    if (res.ok) {
      await load();
      notifyWalletUpdate();
    } else {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Withdraw failed");
    }
  }

  const parsedCustomWithdrawAmount =
    customWithdrawAmount.trim() === "" ? NaN : Number(customWithdrawAmount);

  const balanceCents = wallet ? Number(wallet.balance) : 0;
  const balanceDollars = balanceCents / 100;

  const fmt = (s?: string) =>
    (Number(s ?? "0") / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const panelContent = (() => {
    if (!wallet) return null;

    if (activePanel === "add") {
      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-semibold text-white">Add funds</h3>
            <p className="text-sm text-slate-400">
              Drop in preset amounts or choose a custom number between $1 and $200.
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Quick add funds</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_DEPOSIT_AMOUNTS.map((amountOption) => (
                <button
                  key={`deposit-${amountOption}`}
                  type="button"
                  onClick={() => deposit(amountOption)}
                  disabled={depositing}
                  className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-[#c5305f] hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                >
                  Add {amountOption.toFixed(2)} USD
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void depositCustom();
            }}
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="flex flex-1 items-center gap-3">
              <label
                htmlFor="custom-amount"
                className="text-xs uppercase tracking-wide text-slate-400"
              >
                Custom amount (USD)
              </label>
              <input
                id="custom-amount"
                type="number"
                min={1}
                max={200}
                step={0.01}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="w-full rounded border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30 sm:max-w-[160px]"
              />
            </div>
            <button
              type="submit"
              disabled={depositing || !customAmountValid}
              className="rounded-lg bg-[#c5305f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a61a42] disabled:cursor-not-allowed disabled:bg-[#c5305f]/50"
            >
              {depositing ? "Depositing..." : "Add custom amount"}
            </button>
          </form>
          <p className="text-xs text-slate-400">
            Enter between $1.00 and $200.00 inclusive. Decimals are supported.
          </p>
        </div>
      );
    }

    if (activePanel === "withdraw") {
      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-semibold text-white">Withdraw funds</h3>
            <p className="text-sm text-slate-400">
              Withdraw any amount from $1.00 up to your available balance.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!Number.isFinite(parsedCustomWithdrawAmount)) return;
              void withdraw(parsedCustomWithdrawAmount);
            }}
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="flex flex-1 items-center gap-3">
              <label
                htmlFor="custom-withdraw-amount"
                className="text-xs uppercase tracking-wide text-slate-400"
              >
                Withdraw amount (USD)
              </label>
              <input
                id="custom-withdraw-amount"
                type="number"
                min={1}
                step={0.01}
                value={customWithdrawAmount}
                onChange={(e) => setCustomWithdrawAmount(e.target.value)}
                className="w-full rounded border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30 sm:max-w-[160px]"
              />
            </div>
            <button
              type="submit"
              disabled={
                withdrawing ||
                !Number.isFinite(parsedCustomWithdrawAmount) ||
                parsedCustomWithdrawAmount < 1 ||
                parsedCustomWithdrawAmount > balanceDollars
              }
              className="rounded-lg bg-[#c5305f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a61a42] disabled:cursor-not-allowed disabled:bg-[#c5305f]/50"
            >
              {withdrawing ? "Withdrawing..." : "Withdraw"}
            </button>
          </form>
          <p className="text-xs text-slate-400">
            Current available balance: {fmt(wallet.balance)} USD.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-semibold text-white">Transactions</h3>
          <p className="text-sm text-slate-400">Your most recent ledger activity.</p>
        </div>
        <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40">
          {ledger.length === 0 ? (
            <div className="p-4 text-sm text-slate-400">No entries yet.</div>
          ) : (
            ledger.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-4 p-4 text-sm text-slate-200"
              >
                <div>
                  <p className="font-medium capitalize text-white">
                    {entry.kind.replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(entry.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="font-mono text-base">
                  {Number(entry.amount) > 0 ? "+" : ""}
                  {fmt(entry.amount)} USD
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  })();

  return (
    <DashboardShell
      title="Wallet"
      description="Review your bankroll and transaction history at a glance."
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-slate-400">
          <span className="animate-pulse">Loading...</span>
        </div>
      ) : wallet ? (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="rounded-2xl border border-white/10 bg-[#0b0614] p-5 shadow-lg shadow-[#2b1230]/30 lg:flex-[2]">
              <p className="text-2xl font-semibold text-white">Wallet</p>
              <p className="mt-1 text-sm text-slate-400">
                Review your bankroll and transaction history at a glance.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 text-right shadow-lg shadow-[#c5305f]/15 lg:flex-1">
              <p className="text-xs uppercase tracking-wide text-slate-400">Available balance</p>
              <p className="mt-2 text-3xl font-semibold text-[#8db6ff]">{fmt(wallet.balance)} USD</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 text-right lg:flex-1">
              <p className="text-xs uppercase tracking-wide text-slate-400">Held balance</p>
              <p className="mt-2 text-base font-semibold text-[#f5aac5]">{fmt(wallet.held)} USD</p>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex flex-row gap-3 overflow-x-auto lg:w-64 lg:flex-col lg:overflow-visible">
              {PANEL_OPTIONS.map((panel) => (
                <button
                  key={panel.id}
                  type="button"
                  onClick={() => setActivePanel(panel.id)}
                  className={clsx(
                    "flex-1 rounded-2xl border px-4 py-3 text-left transition lg:flex-none",
                    activePanel === panel.id
                      ? "border-[#c5305f]/70 bg-[#1a0d18] text-white shadow-lg shadow-[#c5305f]/25"
                      : "border-white/10 bg-slate-950/60 text-slate-300 hover:text-white"
                  )}
                >
                  <p className="text-sm font-semibold">{panel.label}</p>
                  <p className="text-xs text-slate-400">{panel.helper}</p>
                </button>
              ))}
            </div>

            <div className="flex-1 rounded-3xl border border-white/10 bg-slate-950/60 p-6 shadow-xl shadow-black/30">
              {panelContent}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-100">
          No wallet found.
        </div>
      )}
    </DashboardShell>
  );
}
