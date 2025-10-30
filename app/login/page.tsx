"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
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
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Login</h1>
        <input name="email" type="email" placeholder="you@example.com" className="w-full rounded border p-2" required />
        <input name="password" type="password" placeholder="••••••••" className="w-full rounded border p-2" required />
        <button disabled={loading} className="w-full rounded bg-black text-white py-2">
          {loading ? "Signing in..." : "Login"}
        </button>
      </form>
    </main>
  );
}