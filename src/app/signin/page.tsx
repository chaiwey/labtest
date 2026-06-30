"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

function SignInInner() {
  const params = useSearchParams();
  const justRequested = params.get("check") === "1";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await signIn("email", { email, redirect: false, callbackUrl: "/dashboard" });
    setSent(true);
    setLoading(false);
  }

  return (
    <main className="min-h-screen grid place-items-center px-6">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-8 text-center">
          <div className="brand-gradient mx-auto mb-4 h-12 w-12 rounded-2xl shadow-soft" />
          <h1 className="text-3xl font-bold tracking-tight">
            Lab<span className="brand-text">Test</span>
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Voice-labeled lab racks. Sign in with a magic link.
          </p>
        </div>

        {sent || justRequested ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-soft">
            <p className="text-slate-700">
              Check your email for a sign-in link.
            </p>
            <p className="mt-2 text-xs text-slate-400">
              In local development the link is also printed in the server console.
            </p>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft"
          >
            <label className="block text-sm font-medium text-slate-600">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@lab.org"
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/20"
            />
            <button
              type="submit"
              disabled={loading}
              className="brand-gradient mt-4 w-full rounded-xl px-4 py-2.5 font-medium text-white shadow-soft transition hover:opacity-90 hover:shadow-lg active:scale-95 disabled:opacity-60 motion-reduce:transform-none"
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}
