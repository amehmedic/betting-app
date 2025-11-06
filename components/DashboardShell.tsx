"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import type { ReactNode } from "react";
import clsx from "clsx";

type NavItem = {
  href: string;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/wallet", label: "Wallet" },
  { href: "/coin", label: "Coin Flip" },
  { href: "/blackjack", label: "Blackjack" },
  { href: "/lucky6", label: "Lucky 6" },
];

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-semibold text-emerald-300">
              WagerWorks
            </span>
            <span className="text-sm text-slate-400">
              {description ?? "Pick a game and test your luck"}
            </span>
          </div>
          <nav className="flex items-center gap-2 text-sm font-medium">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "rounded-md px-3 py-2 transition-colors",
                    active
                      ? "bg-emerald-500/20 text-emerald-200"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-md border border-white/20 px-3 py-2 text-slate-300 transition hover:border-emerald-400 hover:text-white"
            >
              Logout
            </button>
          </nav>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-white">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-slate-400">{description}</p>
          ) : null}
        </header>
        <section className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 shadow-2xl shadow-emerald-500/10">
          {children}
        </section>
      </main>
    </div>
  );
}
