"use client";

// PART B stub — visual-editor slot detail panel driven by the SAME ProjectFields
// schema as the spreadsheet. Each field renders as an editable input; the
// "Add Field" control calls create_project_field() — the identical mutation the
// spreadsheet's "Add column" uses — so the new field instantly becomes a column
// over there. Reference integration component.

import { useState } from "react";
import { useProjectFields, useSlotValues } from "./useProjectFields";

export function SlotDetailPanel({
  projectId,
  rackId,
  slot,
}: {
  projectId: string;
  rackId: string;
  slot: { id: string; position: string };
}) {
  const { fields, createField } = useProjectFields(projectId);
  const { setValue, valueFor } = useSlotValues(rackId);
  const [adding, setAdding] = useState(false);
  const [newField, setNewField] = useState("");

  const list = fields.data ?? [];

  function addField() {
    const name = newField.trim();
    if (!name) return;
    // Same create_project_field() call as the spreadsheet's "Add column".
    createField.mutate({ projectId, name });
    setNewField("");
    setAdding(false);
  }

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        Slot
      </p>
      <h3 className="text-2xl font-bold">
        <span className="brand-text">{slot.position}</span>
      </h3>

      <dl className="mt-4 space-y-3">
        {list.map((f) => (
          <div key={f.id}>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400 capitalize">
              {f.name}
            </dt>
            <dd>
              <input
                type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                defaultValue={valueFor(slot.id, f.id)}
                onBlur={(e) =>
                  setValue.mutate({
                    slotId: slot.id,
                    fieldId: f.id,
                    value: e.target.value || null,
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/20"
              />
            </dd>
          </div>
        ))}
      </dl>

      {adding ? (
        <div className="mt-4 flex gap-2">
          <input
            autoFocus
            value={newField}
            onChange={(e) => setNewField(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addField()}
            placeholder="Field name…"
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
    </aside>
  );
}
