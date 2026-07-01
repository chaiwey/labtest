// Pure, DOM-free helpers for the Excel-like Spreadsheet view: TSV clipboard
// (de)serialization and smart fill-series. Kept out of the component so they can
// be unit-tested directly. See spreadsheet.test.ts.

import { parseDate, type FieldType } from "./fields";

/** Serialize a 2D grid to TSV (tabs between cols, newlines between rows) — the
 * clipboard format Excel/Sheets read and write. */
export function toTSV(grid: string[][]): string {
  return grid.map((row) => row.join("\t")).join("\n");
}

/** Parse clipboard TSV into a 2D grid. Tolerates CRLF and a single trailing
 * newline (Excel appends one). Empty input → empty grid. */
export function fromTSV(text: string): string[][] {
  if (!text) return [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const body = normalized.replace(/\n+$/, ""); // drop trailing blank line(s)
  if (body === "") return [];
  return body.split("\n").map((line) => line.split("\t"));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Parse an ISO yyyy-mm-dd (or anything parseDate understands) to a local Date. */
function parseISO(s: string): Date | null {
  const iso = parseDate(s);
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const DAY_MS = 86400000;

const stripPct = (s: string) => s.replace(/%\s*$/, "");

/** Strict number: the WHOLE cell must be numeric (so "2026-06-01" is NOT a
 * number — that's a date — while "5", "-3.5", "10%" are). */
function strictNum(s: string): number | null {
  const t = stripPct(s).trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

/**
 * Produce `length` values that continue after `source` for one fill-dragged
 * column. Pattern detection is **content-driven** (like Excel), not just by the
 * column's declared type, so `1,2,3` or `2,4,6,8` extend even in a text column.
 * `type` only supplies formatting hints (percent suffix). Excel semantics:
 *
 * - numbers: ≥2 sources → continue the arithmetic step (`1,2,3`→`4,5,6`;
 *   `2,4,6,8`→`10,12,…`); a single number → **copy** (drag with no modifier
 *   repeats). percent keeps a trailing "%".
 * - dates: ≥2 → continue the day-step; a single date → +1 day.
 * - anything else, or `copy` forced (Alt-drag): repeat the source, cycling.
 */
export function fillSeries(
  source: string[],
  type: FieldType,
  length: number,
  copy = false,
): string[] {
  if (length <= 0) return [];
  const cycle = () =>
    Array.from({ length }, (_, i) => source[i % source.length] ?? "");
  if (source.length === 0) return Array.from({ length }, () => "");
  if (copy) return cycle();

  // Numeric series (detected from content, tolerating a trailing %).
  const nums = source.map(strictNum);
  if (nums.every((n) => n !== null)) {
    const vals = nums as number[];
    if (vals.length < 2) return cycle(); // single number → copy (Excel)
    const pct = type === "percent" || source.some((s) => /%\s*$/.test(s));
    const suffix = pct ? "%" : "";
    const step = vals[vals.length - 1] - vals[vals.length - 2];
    let cur = vals[vals.length - 1];
    return Array.from({ length }, () => {
      cur = Number((cur + step).toFixed(10)); // avoid float noise (0.30000004)
      return `${cur}${suffix}`;
    });
  }

  // Date series.
  const dates = source.map(parseISO);
  if (dates.every((d) => d !== null)) {
    const ds = dates as Date[];
    const stepDays =
      ds.length >= 2
        ? Math.round((ds[ds.length - 1].getTime() - ds[ds.length - 2].getTime()) / DAY_MS)
        : 1;
    let cur = ds[ds.length - 1].getTime();
    return Array.from({ length }, () => {
      cur += stepDays * DAY_MS;
      return toISO(new Date(cur));
    });
  }

  return cycle();
}
