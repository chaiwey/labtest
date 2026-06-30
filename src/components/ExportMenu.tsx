"use client";

import { exportCsv, exportPdf, exportXlsx, type ExportSlot } from "@/lib/export";

export function ExportMenu({
  rackName,
  slots,
}: {
  rackName: string;
  slots: ExportSlot[];
}) {
  const disabled = slots.length === 0;
  const btn =
    "rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-40";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400">Export</span>
      <button className={btn} disabled={disabled} onClick={() => exportCsv(rackName, slots)}>
        CSV
      </button>
      <button className={btn} disabled={disabled} onClick={() => exportXlsx(rackName, slots)}>
        XLSX
      </button>
      <button className={btn} disabled={disabled} onClick={() => exportPdf(rackName, slots)}>
        PDF
      </button>
    </div>
  );
}
