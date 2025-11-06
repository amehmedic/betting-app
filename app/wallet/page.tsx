"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";

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

export default function WalletPage() {
  const router = useRouter();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const [depositing, setDepositing] = useState(false);

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
    } else {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Deposit failed");
    }
  }

  const fmt = (s?: string) =>
    (Number(s ?? "0") / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

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
          <div className="flex flex-col gap-6 rounded-xl border border-white/10 bg-white/5 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Currency</p>
              <p className="text-2xl font-semibold text-white">{wallet.currency}</p>
            </div>
            <div className="grid w-full gap-3 text-right md:w-auto">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Balance</p>
                <p className="text-3xl font-semibold text-emerald-300">{fmt(wallet.balance)} USD</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Held</p>
                <p className="text-sm text-slate-300">{fmt(wallet.held)} USD</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => deposit(10)}
                disabled={depositing}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
              >
                {depositing ? "Depositing..." : "Add 10.00 USD"}
              </button>
              <button
                onClick={() => deposit(100)}
                disabled={depositing}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
              >
                {depositing ? "Depositing..." : "Add 100.00 USD"}
              </button>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Recent activity
            </h2>
            <div className="mt-3 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-slate-900/50">
              {ledger.length === 0 ? (
                <div className="p-4 text-sm text-slate-400">No entries yet.</div>
              ) : (
                ledger.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-4 p-4 text-sm text-slate-200"
                  >
                    <div>
                      <p className="font-medium capitalize text-white">{entry.kind.replace(/_/g, " ")}</p>
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
        </div>
      ) : (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-100">
          No wallet found.
        </div>
      )}
    </DashboardShell>
  );
}
