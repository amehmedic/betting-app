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
  { href: "/roulette", label: "Roulette" },
  { href: "/lucky6", label: "Lucky 6" },
];

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function DashboardShell({
  title,
  description,
  children,
  username,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  username?: string | null;
}) {
  const pathname = usePathname();
  const [summary, setSummary] = useState<{ balance: number; held: number } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [navUsername, setNavUsername] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;

    setHydrated(true);

    try {
      const raw = window.localStorage.getItem("dashboard:summary");
      if (raw) {
        const cached = JSON.parse(raw) as { balance: number; held: number };
        setSummary(cached);
      }
    } catch {
      /* ignore */
    }
    try {
      const cachedUser = window.localStorage.getItem("dashboard:username");
      if (cachedUser) setNavUsername(cachedUser);
    } catch {
      /* ignore */
    }

    async function fetchSummary() {
      setSummaryLoading(true);
      try {
        const res = await fetch("/api/wallet", { cache: "no-store" });
        if (!active) return;
        if (res.ok) {
          const json = await res.json();
          const balance = Number(json?.wallet?.balance ?? 0) / 100;
          const held = Number(json?.wallet?.held ?? 0) / 100;
          const next = { balance, held };
          setSummary(next);
          try {
            window.localStorage.setItem("dashboard:summary", JSON.stringify(next));
          } catch {
            /* ignore */
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setSummaryLoading(false);
      }
    }

    fetchSummary();
    async function fetchProfile() {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        if (!active || !res.ok) return;
        const json = await res.json().catch(() => null);
        if (json?.ok && json.user) {
          const name = json.user.username ?? json.user.email ?? null;
          if (name) {
            setNavUsername(name as string);
            try {
              window.localStorage.setItem("dashboard:username", name as string);
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore */
      }
    }

    if (username) {
      setNavUsername(username);
      try {
        window.localStorage.setItem("dashboard:username", username);
      } catch {
        /* ignore */
      }
    } else {
      fetchProfile();
    }

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
          <div className="flex flex-1 items-center justify-end gap-3 text-sm font-medium tracking-wide text-slate-100">
            <Link
              href="/wallet"
              className={clsx(
                "flex items-center gap-3 rounded-full px-4 py-2 text-sm font-medium text-white transition shadow-inner shadow-[#5c7cfa]/20",
                pathname.startsWith("/wallet")
                  ? "border border-[#7c91ff] text-[#cdd8ff]"
                  : "border border-[#5c7cfa]/40 hover:border-[#7c91ff] hover:text-[#cdd8ff]"
              )}
              title="View wallet details"
            >
              <span>Balance</span>
              <span className="font-mono">
                {hydrated && summary
                  ? usd.format(summary.balance)
                  : summaryLoading
                  ? "..."
                  : usd.format(0)}
              </span>
            </Link>
            <Link
              href="/profile"
              className={clsx(
                "rounded-full px-4 py-2 text-sm font-medium text-white transition",
                pathname.startsWith("/profile")
                  ? "border border-[#5c7cfa] text-[#cdd8ff]"
                  : "border border-white/20 hover:border-[#5c7cfa] hover:text-[#cdd8ff]"
              )}
              title="View profile"
            >
              {hydrated && navUsername ? navUsername : "Profile"}
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-full border border-[#c5305f]/60 px-4 py-2 text-sm font-medium text-white transition hover:bg-[#c5305f]/15"
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
