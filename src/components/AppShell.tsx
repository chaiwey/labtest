"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "./AppHeader";
import { Sidebar } from "./Sidebar";

const STORAGE_KEY = "labtest:sidebar-collapsed";

/**
 * App-wide chrome: a collapsible left sidebar plus a top bar, with the page
 * content filling the remaining width. Replaces the old centered max-width
 * layout so the app reads as a full workspace. Collapse state is remembered
 * across navigations/reloads via localStorage.
 */
export function AppShell({
  email,
  children,
}: {
  email?: string | null;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });

  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader email={email} collapsed={collapsed} onToggleSidebar={toggle} />
        {children}
      </div>
    </div>
  );
}
