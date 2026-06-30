// Coordinate helpers — single source of truth shared by the parser, the views,
// and exports. Spreadsheet-style: lettered columns (A, B, ... Z, AA), numbered
// rows starting at 1. A position string is letter(s) + 1-based row, e.g. "A3".

export interface Cell {
  row: number; // 0-based
  col: number; // 0-based
}

export interface RackDims {
  rows: number;
  cols: number;
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function colToLetter(col: number): string {
  if (col < 0 || !Number.isInteger(col)) return "";
  let n = col;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** "A" -> 0, "Z" -> 25, "AA" -> 26. Returns -1 for invalid input. */
export function letterToCol(letter: string): number {
  const s = letter.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(s)) return -1;
  let n = 0;
  for (const ch of s) {
    n = n * 26 + (ch.charCodeAt(0) - 64); // A=1
  }
  return n - 1;
}

/** { row: 2, col: 0 } -> "A3". */
export function toPosition(cell: Cell): string {
  return `${colToLetter(cell.col)}${cell.row + 1}`;
}

/**
 * Parse a position token into a 0-based cell. Tolerant of case and internal
 * whitespace ("a 3" -> A3). Returns null if it is not a valid <letters><digits>
 * token. Does NOT bounds-check against a rack — use inBounds for that.
 */
export function parsePosition(input: string): Cell | null {
  if (!input) return null;
  const cleaned = input.replace(/\s+/g, "").toUpperCase();
  const m = /^([A-Z]+)(\d+)$/.exec(cleaned);
  if (!m) return null;
  const col = letterToCol(m[1]);
  const rowNum = parseInt(m[2], 10);
  if (col < 0 || rowNum < 1) return null;
  return { row: rowNum - 1, col };
}

export function inBounds(dims: RackDims, cell: Cell): boolean {
  return (
    cell.row >= 0 &&
    cell.row < dims.rows &&
    cell.col >= 0 &&
    cell.col < dims.cols
  );
}

/** All cells of a rack in reading order (row by row). */
export function allCells(dims: RackDims): Cell[] {
  const cells: Cell[] = [];
  for (let row = 0; row < dims.rows; row++) {
    for (let col = 0; col < dims.cols; col++) {
      cells.push({ row, col });
    }
  }
  return cells;
}
