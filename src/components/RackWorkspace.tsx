"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc-client";
import { inBounds, toPosition, type Cell } from "@/lib/grid";
import { speak, startListening } from "@/lib/voice/speech";
import { parseTranscript } from "@/lib/voice/parser";
import {
  classify_and_parse,
  describeForConfirmation,
  type ClassifyResult,
} from "@/lib/voice/classify";
import type { FieldDef as VocabField } from "@/lib/voice/vocabulary";
import { VoiceButton } from "./VoiceButton";
import { RackGrid } from "./RackGrid";
import { SpreadsheetView } from "./SpreadsheetView";
import { SlotDetailCard, type FieldDef } from "./SlotDetailCard";
import { ExportMenu } from "./ExportMenu";
import { useProjectFields, useSlotValues } from "./fields/useProjectFields";
import { normalizeValue, type FieldType } from "@/lib/fields";

type View = "diagram" | "spreadsheet";

export function RackWorkspace({ rackId }: { rackId: string }) {
  const utils = trpc.useUtils();
  const rack = trpc.rack.get.useQuery({ id: rackId });
  const projectId = rack.data?.project.id ?? "";

  const { fields, createField, updateField, deleteField, saveAsDefault } =
    useProjectFields(projectId);
  const { setValueByCell, valueForCell } = useSlotValues(rackId);
  const settings = trpc.userSettings.get.useQuery();
  const confirmationEnabled = settings.data?.confirmationEnabled ?? true;

  const [view, setView] = useState<View>("diagram");
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [voiceHighlight, setVoiceHighlight] = useState<Cell | null>(null);

  const [selected, setSelected] = useState<Cell | null>(null);
  const [hovered, setHovered] = useState<Cell | null>(null);
  const [editingFocused, setEditingFocused] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  const invalidate = () => utils.rack.get.invalidate({ id: rackId });
  // Atomic multi-field write for voice entries (all values in one tx).
  const applyEntry = trpc.field.applyEntry.useMutation({
    onSuccess: () => {
      invalidate();
      utils.field.valuesByRack.invalidate({ rackId });
    },
    onError: (e) => setMessage(`Couldn’t save: ${e.message}`),
  });
  // Bulk write for spreadsheet fill/paste/clear.
  const setCellsBatch = trpc.field.setCellsBatch.useMutation({
    onSuccess: () => {
      invalidate();
      utils.field.valuesByRack.invalidate({ rackId });
    },
    onError: (e) => setToast(`Couldn’t save: ${e.message}`),
  });

  const fieldDefs: FieldDef[] = (fields.data ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type as FieldDef["type"],
    options: f.options,
  }));

  // Field names the voice command understands, in display order. Label is now a
  // real field (the first one), so it's included naturally.
  const voiceFieldNames = useMemo(
    () =>
      [...(fields.data ?? [])]
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((f) => f.name),
    [fields.data],
  );

  const isFilled = (row: number, col: number) =>
    fieldDefs.some((f) => valueForCell(row, col, f.id));
  // Slot summary for the diagram: the first field with a value (the primary
  // "Label" field shows bare; other fields show "name: value").
  const summary = (row: number, col: number) => {
    for (let i = 0; i < fieldDefs.length; i++) {
      const v = valueForCell(row, col, fieldDefs[i].id);
      if (v) return i === 0 ? v : `${fieldDefs[i].name}: ${v}`;
    }
    return undefined;
  };

  const fieldTypeOf = (fieldId: string): FieldType =>
    fieldDefs.find((f) => f.id === fieldId)?.type ?? "text";

  function saveFieldAt(row: number, col: number, fieldId: string, value: string | null) {
    const v = value === null ? null : normalizeValue(fieldTypeOf(fieldId), value);
    setValueByCell.mutate({ rackId, row, col, fieldId, value: v });
  }

  // Bulk write for the spreadsheet (fill/paste/clear). Normalizes each cell by
  // its field type, then commits the whole batch in one mutation.
  type BatchCell = { row: number; col: number; fieldId: string; value: string | null };
  function saveCellsBatch(cells: BatchCell[]) {
    if (cells.length === 0) return;
    const normalized = cells.map((c) => ({
      ...c,
      value:
        c.value === null || c.value === ""
          ? null
          : normalizeValue(fieldTypeOf(c.fieldId), c.value),
    }));
    setCellsBatch.mutate({ rackId, cells: normalized });
  }
  function addField(name: string, type: FieldType) {
    if (projectId) createField.mutate({ projectId, name, type });
  }
  function renameField(fieldId: string, name: string) {
    const n = name.trim();
    if (n) updateField.mutate({ id: fieldId, name: n });
  }
  function removeField(fieldId: string, name: string) {
    if (confirm(`Delete field “${name}”? Its values on every slot will be removed.`))
      deleteField.mutate(
        { id: fieldId },
        {
          onError: (e) => {
            setToast(e.message);
            setTimeout(() => setToast(null), 3500);
          },
        },
      );
  }
  const selectCell = useCallback((cell: Cell) => {
    setSelected(cell);
    setMessage(null);
  }, []);
  function doSaveAsDefault() {
    if (!projectId) return;
    saveAsDefault.mutate(
      { projectId },
      {
        onSuccess: (r) => {
          setToast(`Saved ${r.count} field${r.count === 1 ? "" : "s"} as your default.`);
          setTimeout(() => setToast(null), 3000);
        },
      },
    );
  }

  function handleTranscript(transcript: string) {
    if (!rack.data) return;
    const dims = { rows: rack.data.rows, cols: rack.data.cols };

    // 1) Query path ("what is in slot B3") — answered + spoken.
    const q = parseTranscript(transcript);
    if (q.type === "query") {
      if (!inBounds(dims, q.cell)) {
        const s = `Slot ${spoken(q.position)} is outside this rack.`;
        speak(s);
        setMessage(s);
        return;
      }
      selectCell(q.cell);
      setVoiceHighlight(q.cell);
      const parts = fieldDefs
        .map((f) => {
          const v = valueForCell(q.cell.row, q.cell.col, f.id);
          return v ? `${f.name} ${v}` : null;
        })
        .filter(Boolean);
      const sentence = parts.length
        ? `Slot ${spoken(q.position)} has ${parts.join(", ")}.`
        : `Slot ${spoken(q.position)} is empty.`;
      speak(sentence);
      setMessage(sentence);
      return;
    }

    // 2) Create/Update path — multi-field, order-independent (classify_and_parse).
    // Label is a real field now, so it's matched by name like any other.
    const classifierFields: VocabField[] = (fields.data ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      displayOrder: f.displayOrder,
    }));
    const result = classify_and_parse(transcript, classifierFields);
    if (!result.slot) {
      setMessage("Didn’t catch a slot. Try “Slot A3, type control, owner Sarah”.");
      return;
    }
    if (!inBounds(dims, result.slot)) {
      const s = `Slot ${spoken(result.slot.position)} is outside this rack.`;
      speak(s);
      setMessage(s);
      return;
    }
    const slot = result.slot;
    setSelected(slot);
    setVoiceHighlight(slot);

    if (result.field_value_pairs.every((p) => !p.value)) {
      setMessage(`Heard slot ${slot.position} but no fields to set.`);
      return;
    }

    // Deferred commit so we can require confirmation first. One atomic mutation
    // upserts the slot once and writes all field values together — no concurrent
    // slot inserts, so nothing is lost to the unique constraint.
    const applyPairs = () => {
      const values: { fieldId: string; value: string | null }[] = [];
      for (const p of result.field_value_pairs) {
        if (!p.value || !p.fieldId) continue;
        values.push({
          fieldId: p.fieldId,
          value: normalizeValue(fieldTypeOf(p.fieldId), p.value),
        });
      }
      applyEntry.mutate({ rackId, row: slot.row, col: slot.col, values });
    };

    const readback = describeForConfirmation(result);
    if (!confirmationEnabled) {
      applyPairs();
      setMessage(readback.replace(/\s*—?\s*confirm\?$/i, "") + " Saved.");
      return;
    }

    // Confirmation on: speak the readback, then auto-open the mic for yes/no.
    setAwaitingConfirm(true);
    setMessage(`${readback}  (say “yes” to save or “no” to retry)`);
    speak(readback, () => listenForConfirm(applyPairs, result, 0));
  }

  function listenForConfirm(apply: () => void, result: ClassifyResult, attempt: number) {
    startListening(
      (answer) => respondToConfirm(answer, apply, result, attempt),
      (err) => {
        setMessage(err);
        setAwaitingConfirm(false);
      },
      undefined,
      // Hands-free: no key is held for the yes/no reply, so auto-stop once the
      // speaker finishes (short window — "yes"/"no" are quick).
      { autoStop: { silenceMs: 900, maxMs: 5000 } },
    );
  }

  function respondToConfirm(
    answer: string,
    apply: () => void,
    result: ClassifyResult,
    attempt: number,
  ) {
    const pos = result.slot?.position ?? "";
    const a = answer.toLowerCase();
    if (/\b(yes|yeah|yep|yup|correct|confirm|confirmed|save|saved|sure|okay|ok|right|affirmative)\b/.test(a)) {
      apply();
      setAwaitingConfirm(false);
      setMessage(`Saved slot ${pos}.`);
      speak("Saved.");
      return;
    }
    if (/\b(no|nope|nah|cancel|discard|retry|redo|again|wrong|negative)\b/.test(a)) {
      setAwaitingConfirm(false);
      setMessage("Discarded. Hold Space and say your entry again.");
      speak("Okay, let’s try again.");
      return;
    }
    if (attempt < 2) {
      setMessage("Didn’t catch that — say “yes” or “no”.");
      speak("Please say yes or no.", () => listenForConfirm(apply, result, attempt + 1));
    } else {
      setAwaitingConfirm(false);
      setMessage("Cancelled. Hold Space to try again.");
    }
  }

  if (rack.isLoading)
    return <p className="mx-auto max-w-6xl px-6 py-10 text-slate-400">Loading…</p>;
  if (!rack.data)
    return <p className="mx-auto max-w-6xl px-6 py-10 text-slate-500">Rack not found.</p>;

  // Export the primary (first) field — the "Label" — as each slot's label.
  const labelFieldId = fieldDefs[0]?.id;
  const exportSlots = rack.data.slots.map((s) => ({
    row: s.row,
    col: s.col,
    label: labelFieldId ? valueForCell(s.row, s.col, labelFieldId) : "",
  }));

  const active: Cell | null =
    editingFocused && selected ? selected : (hovered ?? selected);
  const editable =
    !!selected &&
    !!active &&
    active.row === selected.row &&
    active.col === selected.col;

  const activeInfo = active
    ? { position: toPosition(active), row: active.row, col: active.col }
    : null;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link
        href={`/projects/${rack.data.project.id}`}
        className="text-sm text-slate-400 hover:text-slate-600"
      >
        ← {rack.data.project.name}
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{rack.data.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {rack.data.rows} × {rack.data.cols} grid · {rack.data.slots.length} filled
          </p>
        </div>
        <ExportMenu rackName={rack.data.name} slots={exportSlots} />
      </div>

      <div className="mt-6">
        <VoiceButton
          onTranscript={handleTranscript}
          message={message}
          fields={voiceFieldNames}
        />
        {awaitingConfirm && (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-accent-purple/10 px-3 py-2 text-sm text-accent-purple">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-purple/60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-purple" />
            </span>
            Listening for “yes” or “no”…
          </div>
        )}
      </div>

      <div className="mt-6 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-soft">
        <ToggleBtn active={view === "diagram"} onClick={() => setView("diagram")}>
          Diagram
        </ToggleBtn>
        <ToggleBtn active={view === "spreadsheet"} onClick={() => setView("spreadsheet")}>
          Spreadsheet
        </ToggleBtn>
      </div>

      <div className="mt-5">
        {view === "diagram" ? (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <RackGrid
              rows={rack.data.rows}
              cols={rack.data.cols}
              isFilled={isFilled}
              summary={summary}
              selected={selected}
              hovered={hovered}
              voiceHighlight={voiceHighlight}
              onHover={setHovered}
              onSelect={selectCell}
            />
            <SlotDetailCard
              slot={activeInfo}
              editable={editable}
              fields={fieldDefs}
              valueFor={(fieldId) =>
                active ? valueForCell(active.row, active.col, fieldId) : ""
              }
              onSaveField={(fieldId, value) =>
                active && saveFieldAt(active.row, active.col, fieldId, value)
              }
              onAddField={addField}
              onDeleteField={removeField}
              onClose={() => {
                setSelected(null);
                setEditingFocused(false);
              }}
              onFocusChange={setEditingFocused}
            />
          </div>
        ) : (
          <SpreadsheetView
            rackId={rackId}
            rows={rack.data.rows}
            cols={rack.data.cols}
            fields={fieldDefs}
            valueForCell={valueForCell}
            isFilled={isFilled}
            onSaveCells={saveCellsBatch}
            onAddField={addField}
            onRenameField={renameField}
            onDeleteField={removeField}
            onSaveAsDefault={doSaveAsDefault}
          />
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
        active ? "brand-gradient text-white shadow-soft" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

/** Read "A3" as "A 3" so TTS pronounces the letter and number separately. */
function spoken(position: string): string {
  return position.replace(/([A-Za-z]+)(\d+)/, "$1 $2");
}
