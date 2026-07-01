import { describe, it, expect } from "vitest";
import { toTSV, fromTSV, fillSeries } from "./spreadsheet";

describe("TSV round-trip", () => {
  it("serializes grid to tabs + newlines", () => {
    expect(toTSV([["a", "b"], ["c", "d"]])).toBe("a\tb\nc\td");
  });

  it("parses TSV, tolerating CRLF and a trailing newline (Excel)", () => {
    expect(fromTSV("a\tb\r\nc\td\r\n")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("round-trips", () => {
    const grid = [["1", "x"], ["2", "y"], ["3", "z"]];
    expect(fromTSV(toTSV(grid))).toEqual(grid);
  });

  it("empty input → empty grid", () => {
    expect(fromTSV("")).toEqual([]);
    expect(fromTSV("\n")).toEqual([]);
  });

  it("preserves empty trailing cells within a row", () => {
    expect(fromTSV("a\t\tc")).toEqual([["a", "", "c"]]);
  });
});

describe("fillSeries — number / percent (content-driven, Excel semantics)", () => {
  it("single number → copy (no modifier repeats)", () => {
    expect(fillSeries(["5"], "number", 3)).toEqual(["5", "5", "5"]);
  });
  it("two numbers → continue the arithmetic step", () => {
    expect(fillSeries(["5", "10"], "number", 3)).toEqual(["15", "20", "25"]);
  });
  it("detects 1,2,3 pattern even in a TEXT column", () => {
    expect(fillSeries(["1", "2", "3"], "text", 3)).toEqual(["4", "5", "6"]);
  });
  it("detects 2,4,6,8 step in a text column", () => {
    expect(fillSeries(["2", "4", "6", "8"], "text", 2)).toEqual(["10", "12"]);
  });
  it("percent series keeps the % suffix", () => {
    expect(fillSeries(["10%", "20%"], "percent", 2)).toEqual(["30%", "40%"]);
  });
  it("Alt/copy forces plain repeat over a numeric pattern", () => {
    expect(fillSeries(["1", "2"], "number", 3, true)).toEqual(["1", "2", "1"]);
  });
  it("non-numeric source falls back to cycling", () => {
    expect(fillSeries(["n/a"], "number", 2)).toEqual(["n/a", "n/a"]);
  });
});

describe("fillSeries — date", () => {
  it("single date → +1 day", () => {
    expect(fillSeries(["2026-06-01"], "date", 2)).toEqual([
      "2026-06-02",
      "2026-06-03",
    ]);
  });
  it("two dates → continue the day-step, across a month boundary", () => {
    expect(fillSeries(["2026-06-29", "2026-06-30"], "date", 2)).toEqual([
      "2026-07-01",
      "2026-07-02",
    ]);
  });
  it("two dates two days apart → step 2", () => {
    expect(fillSeries(["2026-06-01", "2026-06-03"], "date", 2)).toEqual([
      "2026-06-05",
      "2026-06-07",
    ]);
  });
});

describe("fillSeries — text / enum", () => {
  it("single text → repeat", () => {
    expect(fillSeries(["ctrl"], "text", 3)).toEqual(["ctrl", "ctrl", "ctrl"]);
  });
  it("multiple text → cycle", () => {
    expect(fillSeries(["A", "B"], "enum", 3)).toEqual(["A", "B", "A"]);
  });
  it("length 0 → empty", () => {
    expect(fillSeries(["A"], "text", 0)).toEqual([]);
  });
});
