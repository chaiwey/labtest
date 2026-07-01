// Field types + value normalization. Standardizes what a user types OR says
// (e.g. "June 3rd" -> "2024-06-03", "50 percent" -> "50%"). Pure, no LLM.

export type FieldType = "text" | "number" | "date" | "percent" | "enum";

export const FIELD_TYPES: FieldType[] = ["text", "number", "date", "percent", "enum"];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  percent: "Percent (%)",
  enum: "Choice",
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function iso(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}
function validMD(m: number, d: number): boolean {
  return m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

/** Parse common spoken/typed dates to ISO yyyy-mm-dd. Returns null if unrecognized. */
export function parseDate(raw: string, today = new Date()): string | null {
  const s = raw
    .toLowerCase()
    .trim()
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1") // 3rd -> 3
    // Commas AND periods → spaces. Whisper punctuates dictation ("June 2nd,
    // 2026.") and a trailing period would otherwise break the year match and
    // leave the raw junk string saved into a date field.
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;

  const y0 = today.getFullYear();
  if (s === "today") return iso(y0, today.getMonth() + 1, today.getDate());
  if (s === "tomorrow") {
    const t = new Date(today.getTime() + 86400000);
    return iso(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }
  if (s === "yesterday") {
    const t = new Date(today.getTime() - 86400000);
    return iso(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }

  // ISO already
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return validMD(+m[2], +m[3]) ? iso(+m[1], +m[2], +m[3]) : null;

  // numeric m/d or m/d/y (US-style)
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (m) {
    const mo = +m[1];
    const d = +m[2];
    let y = m[3] ? +m[3] : y0;
    if (y < 100) y += 2000;
    return validMD(mo, d) ? iso(y, mo, d) : null;
  }

  const names = Object.keys(MONTHS).join("|");
  // "June 3" / "June 3 2024"
  m = s.match(new RegExp(`^(${names}) (\\d{1,2})(?: (\\d{4}))?$`));
  if (m) {
    const mo = MONTHS[m[1]];
    const d = +m[2];
    const y = m[3] ? +m[3] : y0;
    return validMD(mo, d) ? iso(y, mo, d) : null;
  }
  // "3 June" / "3 June 2024"
  m = s.match(new RegExp(`^(\\d{1,2}) (${names})(?: (\\d{4}))?$`));
  if (m) {
    const d = +m[1];
    const mo = MONTHS[m[2]];
    const y = m[3] ? +m[3] : y0;
    return validMD(mo, d) ? iso(y, mo, d) : null;
  }
  return null;
}

/** Extract a number from messy input ("$12.5", "50%", "12 mg"). */
export function parseNumber(raw: string): number | null {
  const m = raw.replace(/[,\s]/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isNaN(n) ? null : n;
}

/**
 * Normalize a raw value to the field's type. Falls back to the trimmed raw input
 * when it can't be parsed (never silently drops what the user provided).
 */
export function normalizeValue(type: FieldType | string, raw: string): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  switch (type) {
    case "number": {
      const n = parseNumber(v);
      return n === null ? v : String(n);
    }
    case "percent": {
      const n = parseNumber(v);
      return n === null ? v : `${n}%`;
    }
    case "date": {
      return parseDate(v) ?? v;
    }
    default:
      return v;
  }
}

/** The HTML input type to render for a field type. */
export function inputTypeFor(type: FieldType | string): "text" | "number" | "date" {
  if (type === "date") return "date";
  if (type === "number") return "number";
  return "text"; // percent/enum/text use text so "%" and free text are allowed
}
