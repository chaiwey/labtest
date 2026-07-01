// Voice intent classifier + parser. Runs BEFORE field/value extraction and
// distinguishes two intents from a transcript without any LLM:
//   - 'create': a slot + one or more field/value pairs, in ANY order.
//   - 'update': an update-verb cue + a slot + exactly one field/value pair
//               (a partial/PATCH-style edit of a single field).
// See classify.test.ts for worked examples.

import { parsePosition, toPosition, type Cell } from "@/lib/grid";
import {
  buildVocabularyIndex,
  type FieldDef,
  type VocabularyIndex,
  type MatchVia,
} from "./vocabulary";

export type Intent = "create" | "update";
export type PairVia = MatchVia | "positional";

export interface FieldValuePair {
  fieldId: string | null; // null only when a positional value overflows the schema
  fieldName: string;
  value: string;
  matchedVia: PairVia;
  score: number;
}

export interface SlotRef extends Cell {
  position: string;
}

export interface ClassifyResult {
  intent: Intent;
  slot: SlotRef | null;
  field_value_pairs: FieldValuePair[];
  confidence: number;
  used_positional_fallback: boolean;
}

const UPDATE_VERBS = [
  "change",
  "update",
  "edit",
  "modify",
  "correct",
  "reset",
  "switch",
  "rename",
  "set",
];
const FILLER = ["slot", "well", "position", "cell"];
// Threshold to accept a token as a field name mid-utterance (stricter so bare
// values aren't misread as fields). Update-field candidates use a looser bar.
const WALK_THRESHOLD = 0.82;
const UPDATE_FIELD_THRESHOLD = 0.7;

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Find the slot reference, preferring one introduced by "slot"/"well"/etc. */
function findSlot(text: string): SlotRef | null {
  const lead =
    /\b(?:slot|well|position|cell)\s+([a-z]{1,2})\s?(\d{1,3})\b/i.exec(text);
  const any = lead ?? /\b([a-z]{1,2})\s?(\d{1,3})\b/i.exec(text);
  if (!any) return null;
  const cell = parsePosition(`${any[1]}${any[2]}`);
  return cell ? { ...cell, position: toPosition(cell) } : null;
}

/** Strip the slot reference and filler words from a segment string. */
function cleanSegment(seg: string, slot: SlotRef | null): string {
  let s = seg;
  if (slot) {
    const letters = slot.position.replace(/\d+/g, "");
    const digits = slot.position.replace(/\D+/g, "");
    s = s.replace(
      new RegExp(`\\b(?:slot|well|position|cell)?\\s*${letters}\\s?${digits}\\b`, "ig"),
      " ",
    );
  }
  s = s.replace(new RegExp(`\\b(?:${FILLER.join("|")})\\b`, "ig"), " ");
  return s;
}

function tokenize(s: string): string[] {
  return s
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/^[^\w#%.\-]+|[^\w#%.\-]+$/g, ""))
    .filter(Boolean);
}

/** Walk a token list, emitting tagged field/value pairs and bare (untagged) values. */
function walkSegment(
  tokens: string[],
  vocab: VocabularyIndex,
  tagged: { field: FieldDef; value: string; via: MatchVia; score: number }[],
  untagged: string[],
) {
  let curField: FieldDef | null = null;
  let curVia: MatchVia = "name";
  let curScore = 0;
  let buf: string[] = [];

  const flush = () => {
    if (buf.length === 0) return;
    const value = buf.join(" ").trim();
    if (curField) tagged.push({ field: curField, value, via: curVia, score: curScore });
    else untagged.push(value);
    buf = [];
  };

  let i = 0;
  while (i < tokens.length) {
    const two = i + 1 < tokens.length ? `${tokens[i]} ${tokens[i + 1]}` : null;
    let m = two ? vocab.matchField(two, WALK_THRESHOLD) : null;
    let consumed = m ? 2 : 0;
    if (!m) {
      m = vocab.matchField(tokens[i], WALK_THRESHOLD);
      consumed = m ? 1 : 0;
    }
    if (m) {
      flush();
      curField = m.field;
      curVia = m.via;
      curScore = m.score;
      i += consumed;
    } else {
      buf.push(tokens[i]);
      i += 1;
    }
  }
  flush();
}

function parseCreate(
  raw: string,
  slot: SlotRef | null,
  fields: FieldDef[],
  vocab: VocabularyIndex,
): ClassifyResult {
  const tagged: { field: FieldDef; value: string; via: MatchVia; score: number }[] = [];
  const untagged: string[] = [];

  // Commas separate field/value pairs — EXCEPT the comma inside a spoken date
  // ("February 23rd, 2026"), which Whisper punctuates. A comma immediately
  // before a 4-digit year is part of the value, not a separator, so keep the
  // year attached instead of orphaning it onto the next field. Whisper also
  // sometimes tacks an ordinal onto the year ("2026th"), so tolerate that (and
  // there's no \b after "2026" in "2026th", which is why the suffix is matched
  // explicitly rather than relied on).
  const segmented = raw.replace(/,\s*(?=\d{4}(?:st|nd|rd|th)?\b)/gi, " ");

  for (const seg of segmented.split(",")) {
    walkSegment(tokenize(cleanSegment(seg, slot)), vocab, tagged, untagged);
  }

  // Assign any bare values to the next unused fields in display order.
  const usedIds = new Set(tagged.map((t) => t.field.id));
  const remaining = fields.filter((f) => !usedIds.has(f.id));
  let usedPositional = false;
  const positional: FieldValuePair[] = untagged.map((value, i) => {
    usedPositional = true;
    const field = i < remaining.length ? remaining[i] : null;
    return {
      fieldId: field?.id ?? null,
      fieldName: field?.name ?? "",
      value,
      matchedVia: "positional",
      score: field ? 0.5 : 0.2,
    };
  });

  const pairs: FieldValuePair[] = [
    ...tagged.map((t) => ({
      fieldId: t.field.id,
      fieldName: t.field.name,
      value: t.value,
      matchedVia: t.via as PairVia,
      score: t.score,
    })),
    ...positional,
  ];

  // Confidence: slot presence + match quality, capped when guessing positions.
  let confidence = 1;
  if (!slot) confidence -= 0.4;
  if (pairs.length === 0) confidence -= 0.5;
  if (tagged.length > 0) {
    const avg = tagged.reduce((s, t) => s + t.score, 0) / tagged.length;
    confidence *= 0.5 + 0.5 * avg;
  }
  if (usedPositional) confidence = Math.min(confidence, 0.6);

  return {
    intent: "create",
    slot,
    field_value_pairs: pairs,
    confidence: clamp(confidence),
    used_positional_fallback: usedPositional,
  };
}

function parseUpdate(
  raw: string,
  lower: string,
  slot: SlotRef | null,
  fields: FieldDef[],
  vocab: VocabularyIndex,
): ClassifyResult {
  const toMatch = /\bto\b/.exec(lower);
  const idx = toMatch ? toMatch.index : -1;
  const left = idx >= 0 ? raw.slice(0, idx) : raw;
  const value = idx >= 0 ? raw.slice(idx + 2).trim() : "";

  // Field name = the words left of "to", minus verb/slot/filler.
  const cleaned = cleanSegment(left, slot).replace(
    new RegExp(`\\b(?:${UPDATE_VERBS.join("|")})\\b`, "ig"),
    " ",
  );
  // Connector words that surround the field name in update phrasings.
  const STOP = new Set(["of", "the", "its", "for", "a", "an", "to", "field", "value"]);
  const tokens = tokenize(cleaned).filter((t) => !STOP.has(t.toLowerCase()));

  // Prefer the tokens nearest "to": try whole, then last two, then last one.
  const match =
    vocab.matchField(tokens.join(" "), UPDATE_FIELD_THRESHOLD) ??
    (tokens.length >= 2
      ? vocab.matchField(tokens.slice(-2).join(" "), UPDATE_FIELD_THRESHOLD)
      : null) ??
    (tokens.length >= 1
      ? vocab.matchField(tokens[tokens.length - 1], UPDATE_FIELD_THRESHOLD)
      : null);

  let usedPositional = false;
  let pair: FieldValuePair;
  if (match) {
    pair = {
      fieldId: match.field.id,
      fieldName: match.field.name,
      value,
      matchedVia: match.via,
      score: match.score,
    };
  } else {
    // No field named — fall back to the first field by display order.
    usedPositional = true;
    const field = fields[0] ?? null;
    pair = {
      fieldId: field?.id ?? null,
      fieldName: field?.name ?? "",
      value,
      matchedVia: "positional",
      score: field ? 0.4 : 0.2,
    };
  }

  let confidence = 1;
  if (!slot) confidence -= 0.4;
  if (!value) confidence -= 0.4;
  confidence *= 0.6 + 0.4 * pair.score;
  if (usedPositional) confidence = Math.min(confidence, 0.55);

  return {
    intent: "update",
    slot,
    field_value_pairs: [pair],
    confidence: clamp(confidence),
    used_positional_fallback: usedPositional,
  };
}

export function classify_and_parse(
  transcript: string,
  projectFields: FieldDef[],
  vocabularyIndex?: VocabularyIndex,
): ClassifyResult {
  const fields = [...projectFields].sort((a, b) => a.displayOrder - b.displayOrder);
  const vocab = vocabularyIndex ?? buildVocabularyIndex(fields);
  const raw = (transcript ?? "").trim();
  const lower = raw.toLowerCase();

  const slot = findSlot(lower);
  const hasUpdateVerb = UPDATE_VERBS.some((v) =>
    new RegExp(`\\b${v}\\b`).test(lower),
  );
  const hasTo = /\bto\b/.test(lower);

  if (hasUpdateVerb && hasTo) {
    return parseUpdate(raw, lower, slot, fields, vocab);
  }
  return parseCreate(raw, slot, fields, vocab);
}

/** Human-readable confirmation readback for the confirmation flow (Part C/D). */
export function describeForConfirmation(result: ClassifyResult): string {
  const slot = result.slot ? `slot ${spell(result.slot.position)}` : "an unknown slot";
  // A pair with no fieldId is a spoken value we couldn't match to any field —
  // say so plainly instead of leaking an "(unmapped)" placeholder.
  const parts = result.field_value_pairs.map((p) =>
    p.fieldId ? `${p.fieldName} ${p.value}` : `“${p.value}” (no matching field)`,
  );
  const verb = result.intent === "update" ? "Update" : "Set";
  let msg = `${verb} ${slot}: ${parts.join(", ")}.`;
  if (result.used_positional_fallback) {
    const order = result.field_value_pairs
      .filter((p) => p.fieldId)
      .map((p) => p.fieldName)
      .join(", then ");
    if (order) msg += ` Assuming field order: ${order} — confirm?`;
    else msg += " Confirm?";
  } else {
    msg += " Confirm?";
  }
  return msg;
}

function spell(position: string): string {
  return position.replace(/([A-Za-z]+)(\d+)/, "$1 $2");
}
