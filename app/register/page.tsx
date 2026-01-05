"use client";
import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const username = String(form.get("username"));
    const password = String(form.get("password"));
    const confirm = String(form.get("confirm"));

    if (password !== confirm) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, username }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Registration failed.");
        return;
      }
      setMessage("Account created. You can log in now.");
      e.currentTarget.reset();
    } catch (err) {
      console.error(err);
      setError("Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-black/50">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-white">Create account</h1>
          <p className="mt-2 text-sm text-slate-400">Join to place bets and manage your profile.</p>
        </div>
        {(message || error) && (
          <div
            className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
              message ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-100" : ""
            } ${error ? "border-rose-400/50 bg-rose-500/10 text-rose-100" : ""}`}
          >
            {message ?? error}
          </div>
        )}
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2 text-left">
            <label className="text-xs uppercase tracking-wide text-slate-400">Email</label>
            <input
              name="email"
              type="email"
              placeholder="Email"
              className="w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30"
              required
            />
          </div>
          <div className="space-y-2 text-left">
            <label className="text-xs uppercase tracking-wide text-slate-400">Username</label>
            <input
              name="username"
              type="text"
              placeholder="Username"
              className="w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30"
              required
            />
          </div>
          <div className="space-y-2 text-left">
            <label className="text-xs uppercase tracking-wide text-slate-400">Password</label>
            <div className="relative">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                className="w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 pr-10 text-sm text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-2 flex items-center text-slate-500 hover:text-slate-200"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
              </button>
            </div>
          </div>
          <div className="space-y-2 text-left">
            <label className="text-xs uppercase tracking-wide text-slate-400">Confirm password</label>
            <div className="relative">
              <input
                name="confirm"
                type={showConfirm ? "text" : "password"}
                placeholder="Confirm Password"
                className="w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 pr-10 text-sm text-white focus:border-[#5c7cfa] focus:outline-none focus:ring-2 focus:ring-[#5c7cfa]/30"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute inset-y-0 right-2 flex items-center text-slate-500 hover:text-slate-200"
                aria-label={showConfirm ? "Hide password" : "Show password"}
              >
                {showConfirm ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
              </button>
            </div>
          </div>
          <button
            disabled={loading}
            className="w-full rounded-lg bg-[#c5305f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a61a42] disabled:cursor-not-allowed disabled:bg-[#c5305f]/50"
          >
            {loading ? "Creating..." : "Register"}
          </button>
          <p className="text-center text-sm text-slate-400">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-[#c5305f] hover:underline">
              Login
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
