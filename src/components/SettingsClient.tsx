"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";

import { FIELD_TYPES, FIELD_TYPE_LABELS, type FieldType } from "@/lib/fields";
const TYPES = FIELD_TYPES;

export function SettingsClient() {
  const utils = trpc.useUtils();
  const settings = trpc.userSettings.get.useQuery();
  const fields = trpc.userSettings.listDefaultFields.useQuery();

  const setConfirmation = trpc.userSettings.setConfirmation.useMutation({
    onSuccess: () => utils.userSettings.get.invalidate(),
  });

  const invalidateFields = () => utils.userSettings.listDefaultFields.invalidate();
  const createField = trpc.userSettings.createDefaultField.useMutation({
    onSuccess: invalidateFields,
  });
  const updateField = trpc.userSettings.updateDefaultField.useMutation({
    onSuccess: invalidateFields,
  });
  const deleteField = trpc.userSettings.deleteDefaultField.useMutation({
    onSuccess: invalidateFields,
  });
  const reorderFields = trpc.userSettings.reorderDefaultFields.useMutation({
    onSuccess: invalidateFields,
  });

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<FieldType>("text");

  const list = fields.data ?? [];

  function move(index: number, dir: -1 | 1) {
    const next = [...list];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorderFields.mutate({ orderedIds: next.map((f) => f.id) });
  }

  return (
    <main className="max-w-3xl px-6 py-8 lg:px-10">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      {/* Account */}
      <Section title="Account">
        <Row label="Email">
          <span className="text-slate-700">{settings.data?.email ?? "—"}</span>
        </Row>
        <p className="mt-1 text-xs text-slate-400">
          Sign-in uses a magic link, so there is no password to manage.
        </p>
      </Section>

      {/* Voice */}
      <Section title="Voice">
        <Row label="Confirm before saving">
          <Toggle
            checked={settings.data?.confirmationEnabled ?? true}
            onChange={(enabled) => setConfirmation.mutate({ enabled })}
          />
        </Row>
        <p className="mt-1 text-xs text-slate-400">
          When on, voice entries are read back for confirmation before they are
          committed.
        </p>
      </Section>

      {/* Default fields */}
      <Section title="Default fields">
        <p className="-mt-1 mb-4 rounded-lg bg-accent-blue/10 px-3 py-2 text-sm text-accent-blue">
          These fields are added automatically to <strong>new</strong> projects.
          Editing them does not change existing projects.
        </p>

        <div className="space-y-2">
          {list.map((f, i) => (
            <div
              key={f.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5"
            >
              <div className="flex flex-col">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                  aria-label="Move up"
                >
                  ▲
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === list.length - 1}
                  className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                  aria-label="Move down"
                >
                  ▼
                </button>
              </div>
              <input
                defaultValue={f.name}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== f.name) updateField.mutate({ id: f.id, name });
                }}
                className="min-w-[140px] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/20"
              />
              <TypeSelect
                value={f.type as FieldType}
                onChange={(type) => updateField.mutate({ id: f.id, type })}
              />
              <button
                onClick={() => deleteField.mutate({ id: f.id })}
                className="rounded-lg px-2.5 py-1.5 text-sm text-slate-400 transition hover:bg-red-50 hover:text-red-500"
              >
                Remove
              </button>
            </div>
          ))}
          {list.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-400">
              No default fields yet. New projects will start with just the primary
              label.
            </p>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            createField.mutate({ name: newName.trim(), type: newType });
            setNewName("");
            setNewType("text");
          }}
          className="mt-4 flex flex-wrap items-end gap-2"
        >
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-slate-500">
              New field
            </label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Owner"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/20"
            />
          </div>
          <TypeSelect value={newType} onChange={setNewType} />
          <button
            type="submit"
            disabled={!newName.trim() || createField.isPending}
            className="brand-gradient rounded-lg px-4 py-1.5 text-sm font-medium text-white shadow-soft transition hover:opacity-90 disabled:opacity-60"
          >
            Add field
          </button>
        </form>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      {children}
    </div>
  );
}

function TypeSelect({
  value,
  onChange,
}: {
  value: FieldType;
  onChange: (t: FieldType) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as FieldType)}
      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm capitalize outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/20"
    >
      {TYPES.map((t) => (
        <option key={t} value={t}>
          {FIELD_TYPE_LABELS[t]}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition ${
        checked ? "brand-gradient" : "bg-slate-200"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
          checked ? "left-[1.375rem]" : "left-0.5"
        }`}
      />
    </button>
  );
}
