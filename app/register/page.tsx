"use client";
import { useState } from "react";

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    setLoading(false);
    const body = await res.json().catch(() => ({}));
    alert(res.ok ? "Registered! You can log in now." : body.error ?? "Failed");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Create account</h1>
        <input
          name="email"
          type="email"
          placeholder="you@example.com"
          className="w-full rounded border p-2"
          required
        />
        <input
          name="password"
          type="password"
          placeholder="••••••••"
          className="w-full rounded border p-2"
          required
        />
        <button disabled={loading} className="w-full rounded bg-black text-white py-2">
          {loading ? "Creating..." : "Register"}
        </button>
      </form>
    </main>
  );
}