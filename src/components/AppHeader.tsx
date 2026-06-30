"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

export function AppHeader({ email }: { email?: string | null }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link
          href="/dashboard"
          className="group flex items-center gap-2 transition active:scale-95 motion-reduce:transform-none"
        >
          <span className="brand-gradient h-7 w-7 rounded-lg shadow-sm transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3 motion-reduce:transform-none" />
          <span className="text-lg font-bold tracking-tight">
            Lab<span className="brand-text">Test</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          {email && (
            <span className="hidden text-sm text-slate-500 sm:inline">{email}</span>
          )}
          <Link
            href="/settings"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
          >
            Settings
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/signin" })}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
