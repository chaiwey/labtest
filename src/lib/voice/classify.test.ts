import { describe, it, expect } from "vitest";
import { classify_and_parse } from "./classify";
import { buildVocabularyIndex, type FieldDef } from "./vocabulary";

// A representative project schema in display order: Label, Type, Owner.
const FIELDS: FieldDef[] = [
  { id: "f_label", name: "Label", displayOrder: 0 },
  { id: "f_type", name: "Type", displayOrder: 1 },
  { id: "f_owner", name: "Owner", displayOrder: 2 },
];
const VOCAB = buildVocabularyIndex(FIELDS);

const run = (t: string) => classify_and_parse(t, FIELDS, VOCAB);

/** Reduce pairs to a { fieldName: value } map for order-independent assertions. */
function asMap(r: ReturnType<typeof run>): Record<string, string> {
  return Object.fromEntries(r.field_value_pairs.map((p) => [p.fieldName, p.value]));
}

describe("CREATE — field/value pairs in any order", () => {
  it("1. canonical order: Slot, Type, Owner", () => {
    const r = run("Slot A3, type control, owner Sarah");
    expect(r.intent).toBe("create");
    expect(r.slot?.position).toBe("A3");
    expect(asMap(r)).toEqual({ Type: "control", Owner: "Sarah" });
    expect(r.used_positional_fallback).toBe(false);
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it("2. reordered tokens parse identically (order-independent)", () => {
    const a = asMap(run("Slot A3, type control, owner Sarah"));
    const b = asMap(run("Owner Sarah, slot A3, type control"));
    expect(b).toEqual(a);
    expect(run("Owner Sarah, slot A3, type control").slot?.position).toBe("A3");
  });

  it("3. no commas, tagged fields back-to-back", () => {
    const r = run("slot B2 type flagged owner alex");
    expect(r.intent).toBe("create");
    expect(r.slot?.position).toBe("B2");
    expect(asMap(r)).toEqual({ Type: "flagged", Owner: "alex" });
  });

  it("4. multi-word values are preserved", () => {
    const r = run("slot C5, owner Maria Lopez, type treated cells");
    expect(asMap(r)).toEqual({ Owner: "Maria Lopez", Type: "treated cells" });
    expect(r.used_positional_fallback).toBe(false);
  });

  it("9. phonetic confusion: 'tag'→Type, 'order'→Owner", () => {
    const r = run("slot A3 tag control order Sarah");
    expect(asMap(r)).toEqual({ Type: "control", Owner: "Sarah" });
    expect(r.field_value_pairs.every((p) => p.matchedVia === "phonetic")).toBe(true);
  });
});

describe("UPDATE — single-field PATCH", () => {
  it("5. 'change A3 type to flagged'", () => {
    const r = run("change A3 type to flagged");
    expect(r.intent).toBe("update");
    expect(r.slot?.position).toBe("A3");
    expect(r.field_value_pairs).toHaveLength(1);
    expect(r.field_value_pairs[0]).toMatchObject({ fieldName: "Type", value: "flagged" });
  });

  it("6. 'update owner of slot B2 to Sarah'", () => {
    const r = run("update owner of slot B2 to Sarah");
    expect(r.intent).toBe("update");
    expect(r.slot?.position).toBe("B2");
    expect(asMap(r)).toEqual({ Owner: "Sarah" });
  });

  it("7. 'set A3 owner to Jane'", () => {
    const r = run("set A3 owner to Jane");
    expect(r.intent).toBe("update");
    expect(asMap(r)).toEqual({ Owner: "Jane" });
    expect(r.used_positional_fallback).toBe(false);
  });

  it("update touches exactly one field (never a full fill)", () => {
    const r = run("change A3 type to flagged");
    expect(r.field_value_pairs).toHaveLength(1);
    expect(r.field_value_pairs[0].fieldId).toBe("f_type");
  });
});

describe("Fallbacks — positional + ambiguous", () => {
  it("8. untagged bare values fall back to display order, flagged", () => {
    const r = run("slot D4, control sample, Sarah");
    expect(r.intent).toBe("create");
    expect(r.used_positional_fallback).toBe(true);
    // assigned to Label, then Type (the first unused fields in order)
    expect(asMap(r)).toEqual({ Label: "control sample", Type: "Sarah" });
    expect(r.confidence).toBeLessThanOrEqual(0.6);
  });

  it("10. ambiguous update with no field name falls back to first field", () => {
    const r = run("change A3 to flagged");
    expect(r.intent).toBe("update");
    expect(r.used_positional_fallback).toBe(true);
    expect(r.field_value_pairs[0]).toMatchObject({ fieldName: "Label", value: "flagged" });
    expect(r.confidence).toBeLessThanOrEqual(0.55);
  });
});
