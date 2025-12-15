"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";

type NavItem = {
  href: string;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/coin", label: "Coin Flip" },
  { href: "/blackjack", label: "Blackjack" },
  { href: "/lucky6", label: "Lucky 6" },
];

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function DashboardShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [summary, setSummary] = useState<{ balance: number; held: number } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function fetchSummary() {
      setSummaryLoading(true);
      try {
        const res = await fetch("/api/wallet", { cache: "no-store" });
        if (!active) return;
        if (res.ok) {
          const json = await res.json();
          const balance = Number(json?.wallet?.balance ?? 0) / 100;
          const held = Number(json?.wallet?.held ?? 0) / 100;
          setSummary({ balance, held });
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setSummaryLoading(false);
      }
    }

    fetchSummary();

    function refreshListener() {
      fetchSummary();
    }

    window.addEventListener("wallet:update", refreshListener);
    return () => {
      active = false;
      window.removeEventListener("wallet:update", refreshListener);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#05010a] via-[#0f1838] to-[#230a1c] text-slate-100">
      <div className="border-b border-[#1f1630] bg-[#05010a]/85 backdrop-blur">
        <div className="flex h-16 w-full items-center px-6">
          <div className="flex flex-1 items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full">
                <Image
                  src="/boarden-bet-logo.png"
                  alt="Boarden Bet"
                  fill
                  priority
                  className="object-contain"
                />
              </div>
              <span className="text-xl font-semibold tracking-wide text-white">
                Boarden Bet
              </span>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center gap-6 text-sm font-medium">
            <nav className="flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "rounded-full px-3.5 py-1.5 transition",
                      active
                        ? "bg-[#c5305f] text-white shadow-sm shadow-[#c5305f]/40"
                        : "text-slate-300/90 hover:text-white hover:underline"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex flex-1 items-center justify-end gap-5 text-sm font-semibold uppercase tracking-wide text-slate-100">
            <Link
              href="/wallet"
              className="flex items-center gap-4 rounded-full border border-[#5c7cfa]/30 px-4 py-1.5 text-base text-white shadow-inner shadow-[#5c7cfa]/25 transition hover:border-[#7c91ff] hover:text-[#cdd8ff]"
              title="View wallet details"
            >
              <span>Balance</span>
              <span className="font-mono">
                {summary ? usd.format(summary.balance) : summaryLoading ? "..." : usd.format(0)}
              </span>
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-xl border border-[#c5305f]/60 px-5 py-2 text-sm font-semibold tracking-wide text-white transition hover:bg-[#c5305f]/20"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-white">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-slate-400">{description}</p>
          ) : null}
        </header>
        <section className="rounded-2xl border border-white/10 bg-[#060817]/70 p-6 shadow-2xl shadow-[#c5305f]/10">
          {children}
        </section>
      </main>
    </div>
  );
}
