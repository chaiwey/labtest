"use client";

// Route-level error boundary for the rack workspace. If a render throws — e.g.
// React's "Maximum update depth exceeded" from an update loop — this surfaces
// the message on-screen (instead of a silent white-out / jank) so it can be
// read and reported without opening DevTools.

import { useEffect } from "react";

export default function RackError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Also log it for the console, with the component stack when present.
    console.error("[rack workspace error]", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <h1 className="text-lg font-semibold text-red-700">
          Something broke while rendering this rack
        </h1>
        <p className="mt-2 text-sm text-red-600">
          Copy this message and send it over — it pinpoints the bug:
        </p>
        <pre className="mt-3 overflow-auto rounded-lg bg-white p-3 text-xs text-red-800">
          {error?.message || "Unknown error"}
          {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>
        <button
          onClick={reset}
          className="brand-gradient mt-4 rounded-lg px-4 py-2 text-sm font-medium text-white"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
