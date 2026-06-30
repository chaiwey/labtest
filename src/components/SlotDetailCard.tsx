"use client";

import { useState } from "react";

export interface FieldDef {
  id: string;
  name: string;
  type: "text" | "number" | "date" | "enum";
  options?: string[];
}

interface Props {
  slot: { position: string; row: number; col: number } | null;
  editable: boolean; // true when this is the pinned/selected cell
  label: string;
  fields: FieldDef[];
  valueFor: (fieldId: string) => string; // bound to the active cell
  onSaveLabel: (value: string) => void;
  onSaveField: (fieldId: string, value: string | null) => void;
  onAddField: (name: string) => void;
  onClose: () => void;
  onFocusChange: (focused: boolean) => void;
}

export function SlotDetailCard({
  slot,
  editable,
  label,
  fields,
  valueFor,
  onSaveLabel,
  onSaveField,
  onAddField,
  onClose,
  onFocusChange,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [newField, setNewField] = useState("");

  const hasContent = Boolean(label) || fields.some((f) => valueFor(f.id));

  function addField() {
    const name = newField.trim();
    if (!name) return;
    onAddField(name);
    setNewField("");
    setAdding(false);
  }

  return (
    <aside className="lg:sticky lg:top-20">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        {!slot ? (
          <EmptyState />
        ) : (
          // Remount inputs when the active cell changes so defaultValues refresh.
          <div key={slot.position}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Slot
                </p>
                <h3 className="text-2xl font-bold">
                  <span className="brand-text">{slot.position}</span>
                </h3>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  hasContent
                    ? "bg-accent-green/10 text-accent-green"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {hasContent ? "Filled" : "Empty"}
              </span>
            </div>

            <dl className="mt-4 space-y-3">
              <Field label="Label">
                {editable ? (
                  <textarea
                    defaultValue={label}
                    rows={2}
                    onFocus={() => onFocusChange(true)}
                    onBlur={(e) => {
                      onFocusChange(false);
                      if (e.target.value.trim() !== label)
                        onSaveLabel(e.target.value.trim());
                    }}
                    placeholder="e.g. Control sample"
                    className={inputCls}
                  />
                ) : (
                  <ReadOnly value={label} />
                )}
              </Field>

              {fields.map((f) => (
                <Field key={f.id} label={f.name}>
                  {editable ? (
                    <input
                      type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                      list={f.type === "enum" ? `opts-${f.id}` : undefined}
                      defaultValue={valueFor(f.id)}
                      onFocus={() => onFocusChange(true)}
                      onBlur={(e) => {
                        onFocusChange(false);
                        const v = e.target.value;
                        if (v !== valueFor(f.id)) onSaveField(f.id, v || null);
                      }}
                      className={inputCls}
                    />
                  ) : (
                    <ReadOnly value={valueFor(f.id)} />
                  )}
                  {f.type === "enum" && f.options && (
                    <datalist id={`opts-${f.id}`}>
                      {f.options.map((o) => (
                        <option key={o} value={o} />
                      ))}
                    </datalist>
                  )}
                </Field>
              ))}
            </dl>

            {editable && (
              <>
                {adding ? (
                  <div className="mt-4 flex gap-2">
                    <input
                      autoFocus
                      value={newField}
                      onChange={(e) => setNewField(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addField();
                        if (e.key === "Escape") setAdding(false);
                      }}
                      placeholder="New field name…"
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/20"
                    />
                    <button
                      onClick={addField}
                      className="brand-gradient rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                    >
                      Add
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAdding(true)}
                    className="mt-4 w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 transition hover:border-accent-blue/50 hover:text-accent-blue"
                  >
                    + Add Field
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="mt-2 w-full rounded-lg px-3 py-1.5 text-sm text-slate-400 transition hover:bg-slate-50"
                >
                  Done
                </button>
              </>
            )}
            {!editable && (
              <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-center text-sm text-slate-400">
                Click the slot to edit
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

const inputCls =
  "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/20";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function ReadOnly({ value }: { value: string }) {
  return (
    <p className="mt-1 text-slate-700">
      {value ? value : <span className="text-slate-300">—</span>}
    </p>
  );
}

function EmptyState() {
  return (
    <div className="py-6 text-center">
      <div className="brand-gradient mx-auto mb-3 h-10 w-10 rounded-full opacity-80" />
      <p className="font-medium text-slate-600">No slot selected</p>
      <p className="mt-1 text-sm text-slate-400">
        Hover a slot to preview it, or click to edit its fields.
      </p>
    </div>
  );
}
