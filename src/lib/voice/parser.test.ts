import { describe, it, expect } from "vitest";
import { parseTranscript } from "./parser";
import {
  colToLetter,
  letterToCol,
  parsePosition,
  toPosition,
  inBounds,
} from "@/lib/grid";

describe("grid helpers", () => {
  it("colToLetter / letterToCol round-trip", () => {
    for (const col of [0, 1, 25, 26, 27, 51, 52, 700]) {
      expect(letterToCol(colToLetter(col))).toBe(col);
    }
    expect(colToLetter(0)).toBe("A");
    expect(colToLetter(25)).toBe("Z");
    expect(colToLetter(26)).toBe("AA");
  });

  it("parsePosition handles case and whitespace", () => {
    expect(parsePosition("A3")).toEqual({ row: 2, col: 0 });
    expect(parsePosition("a3")).toEqual({ row: 2, col: 0 });
    expect(parsePosition(" c 6 ")).toEqual({ row: 5, col: 2 });
    expect(parsePosition("AA12")).toEqual({ row: 11, col: 26 });
  });

  it("parsePosition rejects junk", () => {
    expect(parsePosition("")).toBeNull();
    expect(parsePosition("3A")).toBeNull();
    expect(parsePosition("hello")).toBeNull();
    expect(parsePosition("A0")).toBeNull();
  });

  it("toPosition is the inverse of parsePosition", () => {
    expect(toPosition({ row: 2, col: 0 })).toBe("A3");
    expect(toPosition({ row: 5, col: 2 })).toBe("C6");
  });

  it("inBounds respects rack dims", () => {
    const dims = { rows: 8, cols: 12 };
    expect(inBounds(dims, { row: 0, col: 0 })).toBe(true);
    expect(inBounds(dims, { row: 7, col: 11 })).toBe(true);
    expect(inBounds(dims, { row: 8, col: 0 })).toBe(false);
    expect(inBounds(dims, { row: 0, col: 12 })).toBe(false);
  });
});

describe("parseTranscript — set", () => {
  it("parses the canonical format", () => {
    const r = parseTranscript("Slot: A3, Label: Control sample");
    expect(r).toMatchObject({ type: "set", position: "A3", label: "Control sample" });
  });

  it("parses spoken variants without punctuation", () => {
    expect(parseTranscript("slot a3 label control sample")).toMatchObject({
      type: "set",
      position: "A3",
      label: "control sample",
    });
    expect(parseTranscript("slot C6 is treated cells")).toMatchObject({
      type: "set",
      position: "C6",
      label: "treated cells",
    });
    expect(parseTranscript("put DMSO blank in slot B2")).toMatchObject({
      type: "set",
      position: "B2",
      label: "DMSO blank",
    });
    expect(parseTranscript("label slot D4 as wild type")).toMatchObject({
      type: "set",
      position: "D4",
      label: "wild type",
    });
  });

  it("preserves label casing and spacing inside the label", () => {
    const r = parseTranscript("Slot: B5, Label: Sample #5 (pH 7.4)");
    expect(r).toMatchObject({ type: "set", position: "B5", label: "Sample #5 (pH 7.4)" });
  });

  it("tolerates messy slot tokens", () => {
    expect(parseTranscript("slot a 3 label control")).toMatchObject({
      type: "set",
      position: "A3",
      label: "control",
    });
  });
});

describe("parseTranscript — query", () => {
  const cases = [
    "what is in slot B3",
    "what's in slot b3",
    "what is in b3",
    "whats in slot B3",
    "read slot B3",
    "contents of B3",
    "tell me about slot B3",
    "what is the label for slot B3",
  ];
  for (const phrase of cases) {
    it(`recognizes "${phrase}"`, () => {
      expect(parseTranscript(phrase)).toMatchObject({ type: "query", position: "B3" });
    });
  }
});

describe("parseTranscript — unknown", () => {
  it("returns unknown for gibberish", () => {
    expect(parseTranscript("hello there how are you").type).toBe("unknown");
    expect(parseTranscript("").type).toBe("unknown");
    expect(parseTranscript("what time is it").type).toBe("unknown");
  });
});
