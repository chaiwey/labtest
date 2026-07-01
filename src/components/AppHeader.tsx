"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

export function AppHeader({
  email,
  collapsed,
  onToggleSidebar,
}: {
  email?: string | null;
  collapsed?: boolean;
  onToggleSidebar?: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <SidebarIcon />
            </button>
          )}
          {/* Brand lives in the sidebar; surface it here only when collapsed. */}
          {collapsed && (
            <Link
              href="/dashboard"
              className="group flex items-center gap-2 transition active:scale-95 motion-reduce:transform-none"
            >
              <span className="brand-gradient h-7 w-7 rounded-lg shadow-sm transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3 motion-reduce:transform-none" />
              <span className="text-lg font-bold tracking-tight">
                Lab<span className="brand-text">Test</span>
              </span>
            </Link>
          )}
        </div>
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

function SidebarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <rect
        x="2.5"
        y="3.5"
        width="15"
        height="13"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M7.5 3.5v13" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
