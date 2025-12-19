"use client";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.ok) router.push("/");
    else alert(res?.error ?? "Login failed");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-black/50">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-white">Login</h1>
          <p className="mt-2 text-sm text-slate-400">Access your account to continue.</p>
        </div>
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
          <button
            disabled={loading}
            className="w-full rounded-lg bg-[#c5305f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a61a42] disabled:cursor-not-allowed disabled:bg-[#c5305f]/50"
          >
            {loading ? "Signing in..." : "Login"}
          </button>
          <p className="text-center text-sm text-slate-400">
            Don't have an account?{" "}
            <Link href="/register" className="font-semibold text-[#c5305f] hover:underline">
              Register
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
