"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";

export function DashboardClient() {
  const utils = trpc.useUtils();
  const projects = trpc.project.list.useQuery();
  const [name, setName] = useState("");

  const create = trpc.project.create.useMutation({
    onSuccess: () => {
      setName("");
      utils.project.list.invalidate();
    },
  });
  const remove = trpc.project.delete.useMutation({
    onSuccess: () => utils.project.list.invalidate(),
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-slate-500">
            Group your lab racks by experiment or study.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate({ name: name.trim() });
        }}
        className="mt-6 flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New project name…"
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/20"
        />
        <button
          type="submit"
          disabled={create.isPending || !name.trim()}
          className="brand-gradient rounded-xl px-5 py-2.5 font-medium text-white shadow-soft transition hover:opacity-90 disabled:opacity-60"
        >
          Create
        </button>
      </form>

      <div className="mt-8">
        {projects.isLoading ? (
          <p className="text-slate-400">Loading…</p>
        ) : projects.data && projects.data.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.data.map((p) => (
              <div
                key={p.id}
                className="group relative rounded-2xl border border-slate-200 bg-white p-5 shadow-soft transition hover:border-accent-blue/40"
              >
                <Link href={`/projects/${p.id}`} className="block">
                  <h3 className="font-semibold text-slate-800">{p.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {p._count.racks} rack{p._count.racks === 1 ? "" : "s"}
                  </p>
                </Link>
                <button
                  onClick={() => {
                    if (confirm(`Delete project "${p.name}" and all its racks?`))
                      remove.mutate({ id: p.id });
                  }}
                  className="absolute right-3 top-3 rounded-lg px-2 py-1 text-xs text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-10 text-center">
            <p className="text-slate-500">No projects yet.</p>
            <p className="mt-1 text-sm text-slate-400">
              Create your first project above to get started.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
