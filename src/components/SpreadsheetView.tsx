"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { allCells, toPosition } from "@/lib/grid";
import type { FieldDef } from "./SlotDetailCard";
import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  inputTypeFor,
  type FieldType,
} from "@/lib/fields";
import { toTSV, fromTSV, fillSeries } from "@/lib/spreadsheet";

type Pos = { r: number; c: number };
export type BatchCell = {
  row: number;
  col: number;
  fieldId: string | null; // null = the Label column
  value: string | null;
};

interface Props {
  rackId: string;
  rows: number;
  cols: number;
  fields: FieldDef[];
  getLabel: (row: number, col: number) => string | undefined;
  valueForCell: (row: number, col: number, fieldId: string) => string;
  isFilled: (row: number, col: number) => boolean;
  // Single write path for edits, fill, paste and clear (batched).
  onSaveCells: (cells: BatchCell[]) => void;
  onAddField: (name: string, type: FieldType) => void;
  onRenameField: (fieldId: string, name: string) => void;
  onDeleteField: (fieldId: string, name: string) => void;
  onSaveAsDefault: () => void;
}

const DEFAULT_W: Record<string, number> = { slot: 72, label: 200 };
const defaultWidth = (key: string) => DEFAULT_W[key] ?? 150;

export function SpreadsheetView({
  rackId,
  rows,
  cols,
  fields,
  getLabel,
  valueForCell,
  isFilled,
  onSaveCells,
  onAddField,
  onRenameField,
  onDeleteField,
  onSaveAsDefault,
}: Props) {
  const [onlyFilled, setOnlyFilled] = useState(false);
  const [editingHeader, setEditingHeader] = useState<string | null>(null);
  const [headerValue, setHeaderValue] = useState("");

  const cells = useMemo(
    () =>
      allCells({ rows, cols }).filter(
        (c) => !onlyFilled || isFilled(c.row, c.col),
      ),
    [rows, cols, onlyFilled, isFilled],
  );

  // ----- grid geometry -------------------------------------------------------
  const totalCols = 1 + fields.length; // col 0 = Label
  const colFieldId = (c: number): string | null => (c === 0 ? null : fields[c - 1].id);
  const colType = (c: number): FieldType => (c === 0 ? "text" : fields[c - 1].type);
  const cellValue = (r: number, c: number): string => {
    const cell = cells[r];
    if (!cell) return "";
    return c === 0
      ? getLabel(cell.row, cell.col) ?? ""
      : valueForCell(cell.row, cell.col, fields[c - 1].id);
  };

  // ----- column widths (resizable, persisted per rack) -----------------------
  const storeKey = `labtest:colw:${rackId}`;
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(`labtest:colw:${rackId}`) || "{}");
    } catch {
      return {};
    }
  });
  const widthsRef = useRef(widths);
  widthsRef.current = widths;
  const colKeys = useMemo(() => ["slot", "label", ...fields.map((f) => f.id)], [fields]);
  const widthOf = (key: string) => widths[key] ?? defaultWidth(key);
  const tableWidth = colKeys.reduce((s, k) => s + widthOf(k), 0);

  const resizeRef = useRef<{ key: string; x: number; w: number } | null>(null);
  function startResize(e: React.MouseEvent, key: string) {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { key, x: e.clientX, w: widthOf(key) };
  }
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const w = Math.max(48, r.w + (e.clientX - r.x));
      setWidths((p) => ({ ...p, [r.key]: w }));
    };
    const up = () => {
      if (!resizeRef.current) return;
      resizeRef.current = null;
      try {
        localStorage.setItem(storeKey, JSON.stringify(widthsRef.current));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [storeKey]);

  // ----- selection state -----------------------------------------------------
  const [active, setActive] = useState<Pos | null>(null);
  const [anchor, setAnchor] = useState<Pos | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [fillEnd, setFillEnd] = useState<Pos | null>(null);

  const draggingRef = useRef(false);
  const fillingRef = useRef(false);
  const fillAltRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const sel = useMemo(() => {
    if (!active || !anchor) return null;
    return {
      r0: Math.min(anchor.r, active.r),
      r1: Math.max(anchor.r, active.r),
      c0: Math.min(anchor.c, active.c),
      c1: Math.max(anchor.c, active.c),
    };
  }, [active, anchor]);

  const fillRect = useMemo(() => {
    if (!sel || !fillEnd) return null;
    if (fillEnd.r > sel.r1) return { r0: sel.r1 + 1, r1: fillEnd.r, c0: sel.c0, c1: sel.c1 };
    if (fillEnd.r < sel.r0) return { r0: fillEnd.r, r1: sel.r0 - 1, c0: sel.c0, c1: sel.c1 };
    return null;
  }, [sel, fillEnd]);

  const inRect = (
    rect: { r0: number; r1: number; c0: number; c1: number } | null,
    r: number,
    c: number,
  ) => !!rect && r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1;

  useEffect(() => {
    setActive(null);
    setAnchor(null);
    setEditing(false);
  }, [onlyFilled]);

  useEffect(() => {
    if (!active || editing) return;
    containerRef.current
      ?.querySelector(`[data-cell="${active.r}-${active.c}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, editing]);

  useEffect(() => {
    const onUp = (e: MouseEvent) => {
      draggingRef.current = false;
      if (fillingRef.current) {
        fillAltRef.current = e.altKey;
        commitFill();
        fillingRef.current = false;
        setFillEnd(null);
      }
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, fillEnd, cells]);

  // ----- writes + undo/redo --------------------------------------------------
  const pushCell = (batch: BatchCell[], r: number, c: number, value: string | null) => {
    const cell = cells[r];
    if (!cell) return;
    batch.push({ row: cell.row, col: cell.col, fieldId: colFieldId(c), value });
  };

  type HistEntry = { undo: () => void; redo: () => void };
  const undoStack = useRef<HistEntry[]>([]);
  const redoStack = useRef<HistEntry[]>([]);

  const currentValueAt = (row: number, col: number, fieldId: string | null): string =>
    fieldId === null ? getLabel(row, col) ?? "" : valueForCell(row, col, fieldId);

  function applyBatch(after: BatchCell[]) {
    if (after.length === 0) return;
    const before: BatchCell[] = after.map((c) => ({
      row: c.row,
      col: c.col,
      fieldId: c.fieldId,
      value: currentValueAt(c.row, c.col, c.fieldId) || null,
    }));
    onSaveCells(after);
    undoStack.current.push({
      undo: () => onSaveCells(before),
      redo: () => onSaveCells(after),
    });
    redoStack.current = [];
  }

  function undo() {
    const e = undoStack.current.pop();
    if (!e) return;
    e.undo();
    redoStack.current.push(e);
  }
  function redo() {
    const e = redoStack.current.pop();
    if (!e) return;
    e.redo();
    undoStack.current.push(e);
  }

  function beginEdit(pos: Pos, initialChar?: string) {
    const it = inputTypeFor(colType(pos.c));
    const base = cellValue(pos.r, pos.c);
    let init = base;
    if (initialChar != null) {
      if (it === "date") init = base;
      else if (it === "number") init = /^[0-9.\-]$/.test(initialChar) ? initialChar : base;
      else init = initialChar;
    }
    setActive(pos);
    setAnchor(pos);
    setEditValue(init);
    setEditing(true);
  }

  function commitEdit(move: "down" | "right" | null) {
    if (!active) return;
    if (editValue !== cellValue(active.r, active.c)) {
      const batch: BatchCell[] = [];
      pushCell(batch, active.r, active.c, editValue === "" ? null : editValue);
      applyBatch(batch);
    }
    setEditing(false);
    containerRef.current?.focus();
    if (move === "down") moveTo({ r: active.r + 1, c: active.c });
    if (move === "right") moveTo({ r: active.r, c: active.c + 1 });
  }

  function clearSelection() {
    if (!sel) return;
    const batch: BatchCell[] = [];
    for (let r = sel.r0; r <= sel.r1; r++)
      for (let c = sel.c0; c <= sel.c1; c++) pushCell(batch, r, c, null);
    applyBatch(batch);
  }

  function commitFill() {
    if (!sel || !fillEnd) return;
    const down = fillEnd.r > sel.r1;
    const up = fillEnd.r < sel.r0;
    if (!down && !up) return;
    const batch: BatchCell[] = [];
    const copy = fillAltRef.current;
    for (let c = sel.c0; c <= sel.c1; c++) {
      const source: string[] = [];
      for (let r = sel.r0; r <= sel.r1; r++) source.push(cellValue(r, c));
      if (down) {
        const targetRows: number[] = [];
        for (let r = sel.r1 + 1; r <= fillEnd.r; r++) targetRows.push(r);
        const vals = fillSeries(source, colType(c), targetRows.length, copy);
        targetRows.forEach((r, i) => pushCell(batch, r, c, vals[i] || null));
      } else {
        const targetRows: number[] = [];
        for (let r = sel.r0 - 1; r >= fillEnd.r; r--) targetRows.push(r);
        const vals = fillSeries([...source].reverse(), colType(c), targetRows.length, copy);
        targetRows.forEach((r, i) => pushCell(batch, r, c, vals[i] || null));
      }
    }
    applyBatch(batch);
  }

  async function copy() {
    if (!sel) return;
    const grid: string[][] = [];
    for (let r = sel.r0; r <= sel.r1; r++) {
      const row: string[] = [];
      for (let c = sel.c0; c <= sel.c1; c++) row.push(cellValue(r, c));
      grid.push(row);
    }
    try {
      await navigator.clipboard?.writeText(toTSV(grid));
    } catch {
      /* ignore */
    }
  }

  async function paste() {
    if (!sel) return;
    let text = "";
    try {
      text = (await navigator.clipboard?.readText()) ?? "";
    } catch {
      return;
    }
    const data = fromTSV(text);
    if (data.length === 0) return;
    const batch: BatchCell[] = [];
    const single = data.length === 1 && data[0].length === 1;
    if (single && (sel.r0 !== sel.r1 || sel.c0 !== sel.c1)) {
      for (let r = sel.r0; r <= sel.r1; r++)
        for (let c = sel.c0; c <= sel.c1; c++) pushCell(batch, r, c, data[0][0] || null);
    } else {
      for (let i = 0; i < data.length; i++) {
        for (let j = 0; j < data[i].length; j++) {
          const r = sel.r0 + i;
          const c = sel.c0 + j;
          if (r < cells.length && c < totalCols) pushCell(batch, r, c, data[i][j] || null);
        }
      }
    }
    applyBatch(batch);
  }

  // ----- navigation ----------------------------------------------------------
  function clamp(pos: Pos): Pos {
    return {
      r: Math.max(0, Math.min(cells.length - 1, pos.r)),
      c: Math.max(0, Math.min(totalCols - 1, pos.c)),
    };
  }
  function moveTo(pos: Pos) {
    const p = clamp(pos);
    setActive(p);
    setAnchor(p);
  }
  function extendTo(pos: Pos) {
    setActive(clamp(pos));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (editing) return;
    if (cells.length === 0) return;
    const a = active ?? { r: 0, c: 0 };
    const meta = e.metaKey || e.ctrlKey;

    if (meta && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if (meta && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if (meta && e.key.toLowerCase() === "c") {
      e.preventDefault();
      copy();
      return;
    }
    if (meta && e.key.toLowerCase() === "v") {
      e.preventDefault();
      paste();
      return;
    }
    if (meta) return;

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        e.shiftKey ? extendTo({ r: a.r - 1, c: a.c }) : moveTo({ r: a.r - 1, c: a.c });
        return;
      case "ArrowDown":
        e.preventDefault();
        e.shiftKey ? extendTo({ r: a.r + 1, c: a.c }) : moveTo({ r: a.r + 1, c: a.c });
        return;
      case "ArrowLeft":
        e.preventDefault();
        e.shiftKey ? extendTo({ r: a.r, c: a.c - 1 }) : moveTo({ r: a.r, c: a.c - 1 });
        return;
      case "ArrowRight":
        e.preventDefault();
        e.shiftKey ? extendTo({ r: a.r, c: a.c + 1 }) : moveTo({ r: a.r, c: a.c + 1 });
        return;
      case "Tab":
        e.preventDefault();
        moveTo(e.shiftKey ? { r: a.r, c: a.c - 1 } : { r: a.r, c: a.c + 1 });
        return;
      case "Enter":
        e.preventDefault();
        if (active) beginEdit(active);
        return;
      case "Backspace":
      case "Delete":
        e.preventDefault();
        clearSelection();
        return;
      case "Escape":
        setAnchor(active);
        return;
      default:
        if (e.key.length === 1 && !e.altKey && active) {
          e.preventDefault();
          beginEdit(active, e.key);
        }
    }
  }

  // ----- header rename / context menu / add-field modal ----------------------
  function startHeaderEdit(fieldId: string, name: string) {
    setEditingHeader(fieldId);
    setHeaderValue(name);
  }
  function commitHeaderEdit(fieldId: string, before: string) {
    const next = headerValue.trim();
    setEditingHeader(null);
    if (!next || next === before) return;
    onRenameField(fieldId, next);
    undoStack.current.push({
      undo: () => onRenameField(fieldId, before),
      redo: () => onRenameField(fieldId, next),
    });
    redoStack.current = [];
  }

  const [menu, setMenu] = useState<
    { x: number; y: number; kind: "field" | "label"; fieldId?: string; name?: string } | null
  >(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<FieldType>("text");
  function openAddField() {
    setNewName("");
    setNewType("text");
    setModalOpen(true);
  }
  function submitAddField() {
    const n = newName.trim();
    if (!n) return;
    onAddField(n, newType);
    setModalOpen(false);
  }

  const showHandle = (r: number, c: number) =>
    !editing && sel !== null && r === sel.r1 && c === sel.c1;

  const SEL_BORDER = "#3b82f6";
  function selShadow(r: number, c: number): string | undefined {
    if (!inRect(sel, r, c)) return undefined;
    const s = sel!;
    const parts: string[] = [];
    if (r === s.r0) parts.push(`inset 0 2px 0 0 ${SEL_BORDER}`);
    if (r === s.r1) parts.push(`inset 0 -2px 0 0 ${SEL_BORDER}`);
    if (c === s.c0) parts.push(`inset 2px 0 0 0 ${SEL_BORDER}`);
    if (c === s.c1) parts.push(`inset -2px 0 0 0 ${SEL_BORDER}`);
    return parts.length ? parts.join(", ") : undefined;
  }

  const Resizer = ({ colKey }: { colKey: string }) => (
    <span
      onMouseDown={(e) => startResize(e, colKey)}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-0 z-20 h-full w-1.5 cursor-col-resize hover:bg-accent-blue/40"
      title="Drag to resize column"
    />
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <span className="text-xs text-slate-400">
          Right-click a column to add or delete fields · click a header to rename ·
          drag borders to resize · ⌘C/⌘V, ⌘Z/⌘Y
        </span>
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

      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="max-h-[60vh] overflow-auto outline-none"
      >
        <table
          className="border-separate border-spacing-0 text-sm"
          style={{ tableLayout: "fixed", width: tableWidth }}
        >
          <colgroup>
            {colKeys.map((k) => (
              <col key={k} style={{ width: widthOf(k) }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="relative border-b border-r border-slate-100 px-4 py-2 font-medium">
                Slot
                <Resizer colKey="slot" />
              </th>
              <th
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, kind: "label" });
                }}
                className="relative border-b border-r border-slate-100 px-4 py-2 font-medium"
              >
                Label
                <Resizer colKey="label" />
              </th>
              {fields.map((f) => (
                <th
                  key={f.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, kind: "field", fieldId: f.id, name: f.name });
                  }}
                  className="relative border-b border-r border-slate-100 px-2 py-2 font-medium"
                >
                  {editingHeader === f.id ? (
                    <input
                      autoFocus
                      value={headerValue}
                      onChange={(e) => setHeaderValue(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitHeaderEdit(f.id, f.name);
                        else if (e.key === "Escape") setEditingHeader(null);
                      }}
                      onBlur={() => commitHeaderEdit(f.id, f.name)}
                      className="w-full rounded border border-accent-blue/40 bg-white px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-600 outline-none ring-2 ring-accent-blue/20"
                    />
                  ) : (
                    <button
                      onClick={() => startHeaderEdit(f.id, f.name)}
                      title="Click to rename · right-click for more"
                      className="block max-w-full truncate rounded px-1 py-0.5 text-left transition hover:bg-slate-200/60"
                    >
                      {f.name}
                    </button>
                  )}
                  <Resizer colKey={f.id} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cells.map((cell, r) => (
              <tr key={`${cell.row}:${cell.col}`}>
                <td className="whitespace-nowrap border-b border-r border-slate-100 px-4 py-1.5 font-medium text-slate-500">
                  {toPosition(cell)}
                </td>
                {Array.from({ length: totalCols }).map((_, c) => {
                  const selected = inRect(sel, r, c);
                  const isActive = active?.r === r && active?.c === c;
                  const inFill = inRect(fillRect, r, c);
                  const editingHere = editing && isActive;
                  return (
                    <td
                      key={c}
                      data-cell={`${r}-${c}`}
                      onMouseDown={(e) => {
                        if (editingHere) return;
                        containerRef.current?.focus();
                        if (e.shiftKey && active) setActive({ r, c });
                        else {
                          setActive({ r, c });
                          setAnchor({ r, c });
                        }
                        setEditing(false);
                        setFillEnd(null);
                        draggingRef.current = true;
                      }}
                      onMouseEnter={() => {
                        if (fillingRef.current) setFillEnd({ r, c });
                        else if (draggingRef.current) setActive({ r, c });
                      }}
                      onDoubleClick={() => beginEdit({ r, c })}
                      style={{ boxShadow: selShadow(r, c) }}
                      className={[
                        "relative overflow-hidden border-b border-r border-slate-100 p-0 transition-colors duration-100",
                        isActive ? "bg-white" : selected ? "bg-accent-blue/10" : "",
                        inFill
                          ? "bg-accent-blue/5 outline outline-1 -outline-offset-1 outline-dashed outline-accent-blue/40"
                          : "",
                      ].join(" ")}
                    >
                      {editingHere ? (
                        <input
                          key={`edit-${r}-${c}`}
                          autoFocus
                          type={inputTypeFor(colType(c))}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              e.stopPropagation();
                              commitEdit("down");
                            } else if (e.key === "Tab") {
                              e.preventDefault();
                              e.stopPropagation();
                              commitEdit("right");
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              e.stopPropagation();
                              setEditing(false);
                              containerRef.current?.focus();
                            }
                          }}
                          onBlur={() => editing && commitEdit(null)}
                          className="h-8 w-full bg-white px-2 outline-none ring-2 ring-accent-blue/40"
                        />
                      ) : (
                        <div className="flex h-8 items-center px-2">
                          <span
                            className={`truncate ${c === 0 ? "text-slate-700" : "text-slate-600"}`}
                          >
                            {cellValue(r, c) || <span className="text-slate-300">—</span>}
                          </span>
                        </div>
                      )}
                      {showHandle(r, c) && (
                        <span
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            fillingRef.current = true;
                            setFillEnd({ r, c });
                          }}
                          title="Drag to fill"
                          className="absolute -bottom-[3px] -right-[3px] z-10 h-2 w-2 cursor-crosshair rounded-[1px] bg-accent-blue"
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {cells.length === 0 && (
              <tr>
                <td colSpan={colKeys.length} className="px-4 py-8 text-center text-slate-400">
                  No filled slots yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Right-click column menu */}
      {menu && (
        <div
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 min-w-[160px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          <button
            onClick={() => {
              openAddField();
              setMenu(null);
            }}
            className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
          >
            Insert field…
          </button>
          {menu.kind === "field" && (
            <>
              <button
                onClick={() => {
                  startHeaderEdit(menu.fieldId!, menu.name!);
                  setMenu(null);
                }}
                className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
              >
                Rename
              </button>
              <button
                onClick={() => {
                  onDeleteField(menu.fieldId!, menu.name!);
                  setMenu(null);
                }}
                className="block w-full px-3 py-1.5 text-left text-red-500 hover:bg-red-50"
              >
                Delete field
              </button>
            </>
          )}
        </div>
      )}

      {/* New-field modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 px-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h3 className="text-base font-semibold text-slate-800">New field</h3>
            <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Name
            </label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitAddField();
                if (e.key === "Escape") setModalOpen(false);
              }}
              placeholder="e.g. Concentration"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/20"
            />
            <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Type
            </label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as FieldType)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/20"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FIELD_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={submitAddField}
                className="brand-gradient rounded-lg px-4 py-1.5 text-sm font-medium text-white"
              >
                Add field
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
