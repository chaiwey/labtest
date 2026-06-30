"use client";

// PART B stub — spreadsheet view driven by the shared ProjectFields schema.
// Adding a column calls create_project_field(); because the slot detail panel
// reads the SAME useProjectFields hook, the new field shows up there immediately
// (and vice-versa). This is a reference integration component.

import { useState } from "react";
import { toPosition } from "@/lib/grid";
import { useProjectFields, useSlotValues } from "./useProjectFields";

interface SlotRow {
  id: string;
  row: number;
  col: number;
}

export function FieldSpreadsheetView({
  projectId,
  rackId,
  slots,
  onToast,
}: {
  projectId: string;
  rackId: string;
  slots: SlotRow[];
  onToast?: (msg: string) => void;
}) {
  const { fields, createField, saveAsDefault } = useProjectFields(projectId);
  const { setValue, valueFor } = useSlotValues(rackId);
  const [newCol, setNewCol] = useState("");

  const cols = fields.data ?? [];

  function addColumn() {
    const name = newCol.trim();
    if (!name) return;
    // Same call the detail panel's "Add Field" uses.
    createField.mutate({ projectId, name });
    setNewCol("");
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-soft">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 p-3">
        <div className="flex items-center gap-2">
          <input
            value={newCol}
            onChange={(e) => setNewCol(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addColumn()}
            placeholder="New column name…"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/20"
          />
          <button
            onClick={addColumn}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            + Add column
          </button>
        </div>
        <button
          onClick={() =>
            saveAsDefault.mutate(
              { projectId },
              {
                onSuccess: (r) =>
                  onToast?.(`Saved ${r.count} field${r.count === 1 ? "" : "s"} as your default.`),
              },
            )
          }
          className="brand-gradient rounded-lg px-3 py-1.5 text-sm font-medium text-white shadow-soft hover:opacity-90"
        >
          Save as my default fields
        </button>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Slot</th>
              {cols.map((f) => (
                <th key={f.id} className="px-3 py-2 font-medium capitalize">
                  {f.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-600">
                  {toPosition(s)}
                </td>
                {cols.map((f) => (
                  <td key={f.id} className="px-2 py-1">
                    <input
                      defaultValue={valueFor(s.id, f.id)}
                      onBlur={(e) =>
                        setValue.mutate({
                          slotId: s.id,
                          fieldId: f.id,
                          value: e.target.value || null,
                        })
                      }
                      className="w-full rounded-lg px-2 py-1 outline-none focus:bg-slate-50"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
