"use client";
import { useEffect, useState } from "react";

type Wallet = {
  id: string;
  currency: string;
  balance: string; // serialized BigInt
  held: string;    // serialized BigInt
};

type Ledger = {
  id: string;
  amount: string;   // serialized BigInt
  kind: string;
  createdAt: string;
};

export default function WalletPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const [depositing, setDepositing] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/wallet", { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      setWallet(json.wallet);
      setLedger(json.ledger);
    } else {
      alert("Failed to load wallet (are you logged in?)");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function deposit(amountMinorUnits: number) {
    setDepositing(true);
    const res = await fetch("/api/wallet/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amountMinorUnits }),
    });
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
    <main className="min-h-screen p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Your Wallet</h1>

      {loading ? (
        <div>Loading…</div>
      ) : wallet ? (
        <>
          <div className="rounded border p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Currency</div>
                <div className="font-semibold">{wallet.currency}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500">Balance</div>
                <div className="text-xl font-bold">{fmt(wallet.balance)} PLAY</div>
                <div className="text-sm text-gray-500">Held: {fmt(wallet.held)}</div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => deposit(1_000)} // 10.00
                disabled={depositing}
                className="rounded bg-black text-white px-3 py-2"
              >
                {depositing ? "Depositing…" : "Add 10.00 PLAY"}
              </button>
              <button
                onClick={() => deposit(10_000)} // 100.00
                disabled={depositing}
                className="rounded border px-3 py-2"
              >
                {depositing ? "Depositing…" : "Add 100.00 PLAY"}
              </button>
            </div>
          </div>

          <h2 className="font-semibold mb-2">Recent activity</h2>
          <div className="rounded border divide-y">
            {ledger.length === 0 ? (
              <div className="p-3 text-sm text-gray-500">No entries yet.</div>
            ) : (
              ledger.map((l) => (
                <div key={l.id} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{l.kind}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(l.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="font-mono">
                    {Number(l.amount) > 0 ? "+" : ""}
                    {fmt(l.amount)} PLAY
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <div>No wallet found.</div>
      )}
    </main>
  );
}