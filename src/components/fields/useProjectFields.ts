"use client";

// Shared field-schema hooks. BOTH the spreadsheet and the slot detail panel use
// these — neither view owns the schema; they read/write the same ProjectFields
// API, so a column added in one appears instantly in the other.

import { trpc } from "@/lib/trpc-client";

export function useProjectFields(projectId: string) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.field.listByProject.invalidate({ projectId });

  const fields = trpc.field.listByProject.useQuery(
    { projectId },
    { enabled: projectId.length > 0 },
  );

  // create_project_field() — called identically from either view.
  const createField = trpc.field.create.useMutation({ onSuccess: invalidate });
  const updateField = trpc.field.update.useMutation({ onSuccess: invalidate });
  const deleteField = trpc.field.delete.useMutation({ onSuccess: invalidate });
  const reorderFields = trpc.field.reorder.useMutation({ onSuccess: invalidate });
  const saveAsDefault = trpc.field.saveAsDefault.useMutation();

  return {
    fields,
    createField,
    updateField,
    deleteField,
    reorderFields,
    saveAsDefault,
  };
}

export function useSlotValues(rackId: string) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.field.valuesByRack.invalidate({ rackId });
  const values = trpc.field.valuesByRack.useQuery({ rackId });

  const setValue = trpc.field.setValue.useMutation({ onSuccess: invalidate });
  // Cell-based: creates the slot on demand (used by the grid + spreadsheet).
  const setValueByCell = trpc.field.setValueByCell.useMutation({
    onSuccess: invalidate,
  });

  // Look up by slot id (used by the reference stubs)…
  const valueFor = (slotId: string, fieldId: string) =>
    values.data?.find((v) => v.slotId === slotId && v.fieldId === fieldId)?.value ??
    "";
  // …or by grid coordinates (used by the live workspace).
  const valueForCell = (row: number, col: number, fieldId: string) =>
    values.data?.find(
      (v) => v.slot.row === row && v.slot.col === col && v.fieldId === fieldId,
    )?.value ?? "";

  return { values, setValue, setValueByCell, valueFor, valueForCell };
}
