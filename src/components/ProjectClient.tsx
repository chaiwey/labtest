"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";

export function ProjectClient({ projectId }: { projectId: string }) {
  const utils = trpc.useUtils();
  const project = trpc.project.get.useQuery({ id: projectId });

  const [name, setName] = useState("");
  const [rows, setRows] = useState(8);
  const [cols, setCols] = useState(12);

  const create = trpc.rack.create.useMutation({
    onSuccess: () => {
      setName("");
      utils.project.get.invalidate({ id: projectId });
    },
  });
  const remove = trpc.rack.delete.useMutation({
    onSuccess: () => utils.project.get.invalidate({ id: projectId }),
  });

  if (project.isLoading)
    return <p className="mx-auto max-w-6xl px-6 py-10 text-slate-400">Loading…</p>;
  if (!project.data)
    return (
      <p className="mx-auto max-w-6xl px-6 py-10 text-slate-500">
        Project not found.
      </p>
    );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/dashboard" className="text-sm text-slate-400 hover:text-slate-600">
        ← All projects
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">{project.data.name}</h1>
      <p className="mt-1 text-sm text-slate-500">Lab racks in this project.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim())
            create.mutate({ projectId, name: name.trim(), rows, cols });
        }}
        className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft"
      >
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-slate-500">
            Rack name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Freezer box 1"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/20"
          />
        </div>
        <DimInput label="Rows" value={rows} onChange={setRows} />
        <DimInput label="Columns" value={cols} onChange={setCols} />
        <button
          type="submit"
          disabled={create.isPending || !name.trim()}
          className="brand-gradient rounded-xl px-5 py-2.5 font-medium text-white shadow-soft transition hover:opacity-90 disabled:opacity-60"
        >
          Add rack
        </button>
      </form>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {project.data.racks.map((r) => (
          <div
            key={r.id}
            className="group relative rounded-2xl border border-slate-200 bg-white p-5 shadow-soft transition hover:border-accent-purple/40"
          >
            <Link href={`/racks/${r.id}`} className="block">
              <h3 className="font-semibold text-slate-800">{r.name}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {r.rows} × {r.cols} grid · {r._count.slots} filled
              </p>
            </Link>
            <button
              onClick={() => {
                if (confirm(`Delete rack "${r.name}"?`)) remove.mutate({ id: r.id });
              }}
              className="absolute right-3 top-3 rounded-lg px-2 py-1 text-xs text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
            >
              Delete
            </button>
          </div>
        ))}
        {project.data.racks.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white/50 p-10 text-center text-slate-500">
            No racks yet. Add one above.
          </div>
        )}
      </div>
    </main>
  );
}

function DimInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="w-20">
      <label className="block text-xs font-medium text-slate-500">{label}</label>
      <input
        type="number"
        min={1}
        max={100}
        value={value}
        onChange={(e) => onChange(Math.max(1, Math.min(100, Number(e.target.value))))}
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/20"
      />
    </div>
  );
}
