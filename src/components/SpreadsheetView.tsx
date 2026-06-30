"use client";

import { useState } from "react";
import { allCells, toPosition } from "@/lib/grid";
import type { FieldDef } from "./SlotDetailCard";

interface Props {
  rows: number;
  cols: number;
  fields: FieldDef[];
  getLabel: (row: number, col: number) => string | undefined;
  valueForCell: (row: number, col: number, fieldId: string) => string;
  isFilled: (row: number, col: number) => boolean;
  onSaveLabel: (row: number, col: number, value: string) => void;
  onSaveField: (row: number, col: number, fieldId: string, value: string | null) => void;
  onAddField: (name: string) => void;
  onSaveAsDefault: () => void;
}

export function SpreadsheetView({
  rows,
  cols,
  fields,
  getLabel,
  valueForCell,
  isFilled,
  onSaveLabel,
  onSaveField,
  onAddField,
  onSaveAsDefault,
}: Props) {
  const [onlyFilled, setOnlyFilled] = useState(false);
  const [newCol, setNewCol] = useState("");

  const cells = allCells({ rows, cols }).filter(
    (c) => !onlyFilled || isFilled(c.row, c.col),
  );

  function addColumn() {
    const name = newCol.trim();
    if (!name) return;
    onAddField(name);
    setNewCol("");
  }

  const inputCls =
    "w-full rounded-lg px-2 py-1 outline-none hover:bg-white focus:bg-white focus:ring-2 focus:ring-accent-blue/20";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
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
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
          >
            + Add column
          </button>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-500">
            <input
              type="checkbox"
              checked={onlyFilled}
              onChange={(e) => setOnlyFilled(e.target.checked)}
            />
            Filled only
          </label>
          <button
            onClick={onSaveAsDefault}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
          >
            Save as my default fields
          </button>
        </div>
      </div>

      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-2 font-medium">Slot</th>
              <th className="px-4 py-2 font-medium">Label</th>
              {fields.map((f) => (
                <th key={f.id} className="px-4 py-2 font-medium">
                  {f.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cells.map((c) => {
              const key = `${c.row}:${c.col}`;
              const label = getLabel(c.row, c.col) ?? "";
              return (
                <tr key={key} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-600">
                    {toPosition(c)}
                  </td>
                  <td className="px-2 py-1">
                    <input
                      key={`l-${label}`}
                      defaultValue={label}
                      onBlur={(e) => {
                        if (e.target.value.trim() !== label)
                          onSaveLabel(c.row, c.col, e.target.value.trim());
                      }}
                      className={inputCls}
                    />
                  </td>
                  {fields.map((f) => {
                    const v = valueForCell(c.row, c.col, f.id);
                    return (
                      <td key={f.id} className="px-2 py-1">
                        <input
                          key={`${f.id}-${v}`}
                          type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                          defaultValue={v}
                          onBlur={(e) => {
                            if (e.target.value !== v)
                              onSaveField(c.row, c.col, f.id, e.target.value || null);
                          }}
                          className={inputCls}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {cells.length === 0 && (
              <tr>
                <td
                  colSpan={2 + fields.length}
                  className="px-4 py-8 text-center text-slate-400"
                >
                  No filled slots yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
