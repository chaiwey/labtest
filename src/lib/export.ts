// Client-side exporters for a rack's filled slots. Position is computed from
// row/col via the shared grid helpers so every format agrees.

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toPosition } from "@/lib/grid";

export interface ExportSlot {
  row: number;
  col: number;
  label: string;
}

interface Row {
  Position: string;
  Row: number;
  Column: string;
  Label: string;
}

function buildRows(slots: ExportSlot[]): Row[] {
  return [...slots]
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((s) => ({
      Position: toPosition(s),
      Row: s.row + 1,
      Column: toPosition({ row: 0, col: s.col }).replace(/\d+$/, ""),
      Label: s.label,
    }));
}

function safeName(name: string): string {
  return name.replace(/[^\w-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "rack";
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportCsv(rackName: string, slots: ExportSlot[]) {
  const rows = buildRows(slots);
  const header = ["Position", "Row", "Column", "Label"];
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    header.join(","),
    ...rows.map((r) => [r.Position, r.Row, r.Column, r.Label].map(escape).join(",")),
  ];
  download(
    new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }),
    `${safeName(rackName)}.csv`,
  );
}

export function exportXlsx(rackName: string, slots: ExportSlot[]) {
  const rows = buildRows(slots);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rack");
  XLSX.writeFile(wb, `${safeName(rackName)}.xlsx`);
}

export function exportPdf(rackName: string, slots: ExportSlot[]) {
  const rows = buildRows(slots);
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(rackName, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`${rows.length} filled slot${rows.length === 1 ? "" : "s"}`, 14, 25);
  autoTable(doc, {
    startY: 30,
    head: [["Position", "Row", "Column", "Label"]],
    body: rows.map((r) => [r.Position, r.Row, r.Column, r.Label]),
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 10 },
  });
  doc.save(`${safeName(rackName)}.pdf`);
}
