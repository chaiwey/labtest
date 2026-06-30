// Deterministic voice-transcript parser. NO LLM — pure regex/string matching.
// Turns a speech-to-text transcript into a structured command the app can act on.

import { parsePosition, type Cell, toPosition } from "@/lib/grid";
import { QUERY_PHRASES, SET_PHRASES } from "./phrases";

export type ParseResult =
  | { type: "set"; position: string; cell: Cell; label: string }
  | { type: "query"; position: string; cell: Cell }
  | { type: "unknown"; raw: string };

// Matches a spoken slot token: letters then digits, optional space between
// ("A3", "a 3", "AA12"). Whitespace inside is normalized away by parsePosition.
const POS = "([a-z]+\\s*\\d+)";
const LABEL = "(.+)";

/** Normalize a transcript for matching while preserving label casing/content. */
function normalize(text: string): string {
  return text
    .trim()
    .replace(/[?!.]+$/g, "") // drop trailing sentence punctuation
    .replace(/[:,]/g, " ") // ':' and ',' act as separators in the canonical form
    .replace(/\s+/g, " ")
    .trim();
}

interface CompiledPhrase {
  re: RegExp;
  posGroup: number; // 1-based capture-group index of {pos}
  labelGroup: number; // 1-based capture-group index of {label}, or 0 if none
}

/** Compile a phrase template into an anchored regex, tracking group order. */
function compile(phrase: string): CompiledPhrase {
  let group = 0;
  let posGroup = 0;
  let labelGroup = 0;
  const escaped = phrase
    .split(/(\{pos\}|\{label\})/)
    .map((part) => {
      if (part === "{pos}") {
        posGroup = ++group;
        return POS;
      }
      if (part === "{label}") {
        labelGroup = ++group;
        return LABEL;
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    })
    .join("");
  return { re: new RegExp(`^${escaped}$`, "i"), posGroup, labelGroup };
}

const QUERY_REGEXES = QUERY_PHRASES.map(compile);
const SET_REGEXES = SET_PHRASES.map(compile);

export function parseTranscript(raw: string): ParseResult {
  const text = normalize(raw);
  if (!text) return { type: "unknown", raw };

  // Query first (more specific question phrasings), then set.
  for (const { re, posGroup } of QUERY_REGEXES) {
    const m = re.exec(text);
    if (m) {
      const cell = parsePosition(m[posGroup]);
      if (cell) return { type: "query", position: toPosition(cell), cell };
    }
  }

  for (const { re, posGroup, labelGroup } of SET_REGEXES) {
    const m = re.exec(text);
    if (m) {
      const cell = parsePosition(m[posGroup]);
      const label = (m[labelGroup] ?? "").trim();
      if (cell && label) {
        return { type: "set", position: toPosition(cell), cell, label };
      }
    }
  }

  return { type: "unknown", raw };
}
