"use client";

import { useMemo, useState } from "react";
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

type View = "diagram" | "spreadsheet";

// The primary slot.label is exposed to the voice classifier as a leading field.
const LABEL_ID = "__label__";

export function RackWorkspace({ rackId }: { rackId: string }) {
  const utils = trpc.useUtils();
  const rack = trpc.rack.get.useQuery({ id: rackId });
  const projectId = rack.data?.project.id ?? "";

  const { fields, createField, saveAsDefault } = useProjectFields(projectId);
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
  const setLabel = trpc.slot.setLabel.useMutation({ onSuccess: invalidate });
  const clear = trpc.slot.clear.useMutation({ onSuccess: invalidate });

  const slotByKey = useMemo(() => {
    const m = new Map<string, string>();
    rack.data?.slots.forEach((s) => m.set(`${s.row}:${s.col}`, s.label));
    return m;
  }, [rack.data]);

  const fieldDefs: FieldDef[] = (fields.data ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type as FieldDef["type"],
    options: f.options,
  }));

  const getLabel = (row: number, col: number) => slotByKey.get(`${row}:${col}`);
  const isFilled = (row: number, col: number) =>
    Boolean(getLabel(row, col)) ||
    fieldDefs.some((f) => valueForCell(row, col, f.id));
  const summary = (row: number, col: number) => {
    const label = getLabel(row, col);
    if (label) return label;
    for (const f of fieldDefs) {
      const v = valueForCell(row, col, f.id);
      if (v) return `${f.name}: ${v}`;
    }
    return undefined;
  };

  function saveLabelAt(row: number, col: number, value: string) {
    if (value.trim()) setLabel.mutate({ rackId, row, col, label: value.trim() });
    else clear.mutate({ rackId, row, col });
  }
  function saveFieldAt(row: number, col: number, fieldId: string, value: string | null) {
    setValueByCell.mutate({ rackId, row, col, fieldId, value });
  }
  function addField(name: string) {
    if (projectId) createField.mutate({ projectId, name });
  }
  function selectCell(cell: Cell) {
    setSelected(cell);
    setMessage(null);
  }
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
      const label = getLabel(q.cell.row, q.cell.col);
      const extras = fieldDefs
        .map((f) => {
          const v = valueForCell(q.cell.row, q.cell.col, f.id);
          return v ? `${f.name} ${v}` : null;
        })
        .filter(Boolean);
      const parts = [label ? `label ${label}` : null, ...extras].filter(Boolean);
      const sentence = parts.length
        ? `Slot ${spoken(q.position)} has ${parts.join(", ")}.`
        : `Slot ${spoken(q.position)} is empty.`;
      speak(sentence);
      setMessage(sentence);
      return;
    }

    // 2) Create/Update path — multi-field, order-independent (classify_and_parse).
    // "Label" is exposed to the classifier as a leading pseudo-field.
    const classifierFields: VocabField[] = [
      { id: LABEL_ID, name: "Label", displayOrder: -1 },
      ...(fields.data ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        displayOrder: f.displayOrder,
      })),
    ];
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

    // Deferred commit so we can require confirmation first.
    const applyPairs = () => {
      for (const p of result.field_value_pairs) {
        if (!p.value) continue;
        if (p.fieldId === LABEL_ID) {
          setLabel.mutate({ rackId, row: slot.row, col: slot.col, label: p.value });
        } else if (p.fieldId) {
          setValueByCell.mutate({
            rackId,
            row: slot.row,
            col: slot.col,
            fieldId: p.fieldId,
            value: p.value,
          });
        }
      }
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
      { continuous: false },
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

  const exportSlots = rack.data.slots.map((s) => ({ row: s.row, col: s.col, label: s.label }));

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
        <VoiceButton onTranscript={handleTranscript} message={message} />
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
              label={active ? (getLabel(active.row, active.col) ?? "") : ""}
              fields={fieldDefs}
              valueFor={(fieldId) =>
                active ? valueForCell(active.row, active.col, fieldId) : ""
              }
              onSaveLabel={(value) =>
                active && saveLabelAt(active.row, active.col, value)
              }
              onSaveField={(fieldId, value) =>
                active && saveFieldAt(active.row, active.col, fieldId, value)
              }
              onAddField={addField}
              onClose={() => {
                setSelected(null);
                setEditingFocused(false);
              }}
              onFocusChange={setEditingFocused}
            />
          </div>
        ) : (
          <SpreadsheetView
            rows={rack.data.rows}
            cols={rack.data.cols}
            fields={fieldDefs}
            getLabel={getLabel}
            valueForCell={valueForCell}
            isFilled={isFilled}
            onSaveLabel={saveLabelAt}
            onSaveField={saveFieldAt}
            onAddField={addField}
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
