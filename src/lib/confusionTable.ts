// Phonetic confusion table + slot-guess corrector for the rack coordinate
// system (letter + number, "A1".."Z99"). Voice transcripts (Web Speech / STT)
// regularly mangle single spoken letters and digits; this module encodes the
// common misrecognitions and uses them, alongside edit distance and phonetic
// codes, to snap a noisy transcript back onto a known valid slot.
//
// Pipeline inside correctSlotGuess():
//   raw text -> normalizeSpoken() -> compact candidate like "A3"
//            -> score against every validSlot via
//               (edit distance) + (Metaphone phonetic) + (confusion table)
//            -> best slot + confidence in [0, 1]

import { distance } from "fastest-levenshtein";
import metaphone from "talisman/phonetics/metaphone";

export interface ConfusionEntry {
  /** The token that gets heard INSTEAD of the canonical key. */
  match: string;
  /** How likely / strong the confusion is, in (0, 1]. */
  weight: number;
}

/**
 * Maps a canonical token (a single letter "A".."Z", a single digit "0".."9",
 * or a whole compound slot like "A3") to the things STT commonly hears in its
 * place. Bidirectional in spirit: if B->D is listed, D->B is also treated as a
 * confusion by the matcher, so we only list each pair once where convenient.
 */
export const confusionTable: Record<string, ConfusionEntry[]> = {
  // --- Letters: the classic "B-set" (voiced/voiceless stops + E) ---
  B: [
    { match: "D", weight: 0.8 },
    { match: "E", weight: 0.7 },
    { match: "V", weight: 0.75 },
    { match: "P", weight: 0.7 },
    { match: "T", weight: 0.6 },
    { match: "C", weight: 0.6 },
    { match: "G", weight: 0.55 },
    { match: "3", weight: 0.5 }, // "bee" vs "three" tail, and visual B/3
  ],
  C: [
    { match: "D", weight: 0.7 },
    { match: "E", weight: 0.65 },
    { match: "T", weight: 0.6 },
    { match: "Z", weight: 0.6 }, // "cee" vs "zee"
    { match: "V", weight: 0.55 },
    { match: "3", weight: 0.5 },
  ],
  D: [
    { match: "B", weight: 0.8 },
    { match: "E", weight: 0.65 },
    { match: "T", weight: 0.7 },
    { match: "P", weight: 0.6 },
    { match: "G", weight: 0.55 },
  ],
  E: [
    { match: "B", weight: 0.7 },
    { match: "D", weight: 0.65 },
    { match: "C", weight: 0.65 },
    { match: "P", weight: 0.6 },
    { match: "G", weight: 0.55 },
    { match: "3", weight: 0.6 },
  ],
  G: [
    { match: "J", weight: 0.85 }, // "jee" vs "jay"
    { match: "D", weight: 0.55 },
    { match: "B", weight: 0.5 },
    { match: "Z", weight: 0.5 },
  ],
  J: [
    { match: "G", weight: 0.85 },
    { match: "K", weight: 0.5 },
    { match: "A", weight: 0.5 }, // "jay" vs "ay"
  ],
  P: [
    { match: "B", weight: 0.7 },
    { match: "T", weight: 0.7 },
    { match: "D", weight: 0.6 },
    { match: "E", weight: 0.55 },
    { match: "V", weight: 0.55 },
  ],
  T: [
    { match: "D", weight: 0.7 },
    { match: "P", weight: 0.7 },
    { match: "B", weight: 0.6 },
    { match: "E", weight: 0.55 },
    { match: "C", weight: 0.55 },
  ],
  V: [
    { match: "B", weight: 0.75 },
    { match: "E", weight: 0.55 },
    { match: "D", weight: 0.5 },
    { match: "P", weight: 0.55 },
  ],
  Z: [
    { match: "C", weight: 0.6 },
    { match: "G", weight: 0.5 },
    { match: "S", weight: 0.5 }, // "zee"/"ess" sibilants
  ],

  // --- Letters: nasals and sibilants ---
  M: [
    { match: "N", weight: 0.85 },
    { match: "EM", weight: 0.5 },
  ],
  N: [
    { match: "M", weight: 0.85 },
    { match: "EN", weight: 0.5 },
  ],
  S: [
    { match: "F", weight: 0.8 }, // "ess" vs "eff"
    { match: "X", weight: 0.6 },
    { match: "Z", weight: 0.5 },
  ],
  F: [
    { match: "S", weight: 0.8 },
    { match: "X", weight: 0.55 },
  ],
  X: [
    { match: "S", weight: 0.6 },
    { match: "F", weight: 0.55 },
    { match: "6", weight: 0.5 }, // "ex" vs "six" tail
  ],

  // --- Letters: vowel-ish and homophone confusions ---
  A: [
    { match: "8", weight: 0.65 }, // "ay" vs "eight"
    { match: "H", weight: 0.6 }, // "ay" vs "aitch" / "hey"
    { match: "J", weight: 0.5 },
    { match: "K", weight: 0.45 },
  ],
  H: [
    { match: "A", weight: 0.6 },
    { match: "8", weight: 0.5 },
  ],
  I: [
    { match: "Y", weight: 0.65 }, // "eye" vs "why"
    { match: "A", weight: 0.5 },
    { match: "1", weight: 0.6 }, // visual / "i" vs "one"
  ],
  Y: [
    { match: "I", weight: 0.65 },
    { match: "5", weight: 0.45 },
  ],
  O: [
    { match: "0", weight: 0.85 }, // "oh" vs "zero"
    { match: "U", weight: 0.45 },
  ],
  U: [
    { match: "O", weight: 0.45 },
    { match: "Q", weight: 0.45 }, // "you" vs "cue"
    { match: "2", weight: 0.4 },
  ],
  K: [
    { match: "A", weight: 0.45 },
    { match: "Q", weight: 0.5 },
    { match: "J", weight: 0.45 },
  ],
  Q: [
    { match: "U", weight: 0.45 },
    { match: "K", weight: 0.5 },
  ],
  L: [
    { match: "M", weight: 0.4 },
    { match: "N", weight: 0.4 },
  ],
  R: [{ match: "A", weight: 0.4 }],

  // --- Digits ---
  "0": [
    { match: "O", weight: 0.85 }, // "zero" vs "oh"
    { match: "OH", weight: 0.85 },
    { match: "ZERO", weight: 0.6 },
  ],
  "1": [
    { match: "WON", weight: 0.85 }, // "one" vs "won"
    { match: "I", weight: 0.6 },
    { match: "9", weight: 0.4 }, // "one"/"nine" run-together
  ],
  "2": [
    { match: "TO", weight: 0.8 },
    { match: "TOO", weight: 0.8 },
    { match: "U", weight: 0.4 },
  ],
  "3": [
    { match: "B", weight: 0.5 },
    { match: "E", weight: 0.5 },
    { match: "TREE", weight: 0.6 },
  ],
  "4": [
    { match: "FOR", weight: 0.8 },
    { match: "FORE", weight: 0.8 },
    { match: "5", weight: 0.45 }, // "four"/"five" f-onset
  ],
  "5": [
    { match: "9", weight: 0.7 }, // "five" vs "nine" end-sound
    { match: "4", weight: 0.45 },
    { match: "Y", weight: 0.4 },
  ],
  "6": [
    { match: "X", weight: 0.5 }, // "six" vs "ex"
    { match: "7", weight: 0.4 },
  ],
  "7": [
    { match: "6", weight: 0.4 },
    { match: "11", weight: 0.4 }, // "seven"/"eleven"
  ],
  "8": [
    { match: "A", weight: 0.65 }, // "eight" vs "ay"
    { match: "ATE", weight: 0.8 },
    { match: "H", weight: 0.5 },
  ],
  "9": [
    { match: "5", weight: 0.7 }, // "nine" vs "five" end-sound
    { match: "1", weight: 0.4 },
  ],

  // --- Compound errors: whole spoken slot mangled as a phrase ---
  // Keyed by the canonical slot; `match` holds the literal noisy transcript
  // (lower-cased, as STT tends to emit it). normalizeSpoken handles most of
  // these structurally, but exact compound hits get a confidence boost.
  A3: [
    { match: "hey three", weight: 0.9 },
    { match: "a three", weight: 0.9 },
    { match: "8 3", weight: 0.85 },
    { match: "eight three", weight: 0.8 },
  ],
  B2: [
    { match: "be too", weight: 0.85 },
    { match: "d two", weight: 0.8 },
    { match: "bee to", weight: 0.85 },
  ],
  C0: [
    { match: "see oh", weight: 0.85 },
    { match: "sea zero", weight: 0.8 },
  ],
  E8: [
    { match: "e ate", weight: 0.85 },
    { match: "ee eight", weight: 0.8 },
  ],
  D10: [
    { match: "the ten", weight: 0.8 },
    { match: "b ten", weight: 0.75 },
  ],
};

// ---------------------------------------------------------------------------
// Spoken-form tables: how each letter / digit is canonically pronounced, plus
// the homophone aliases STT emits. Used both to normalize raw transcripts and
// to expand a slot into a pronounceable form for phonetic comparison.
// ---------------------------------------------------------------------------

const LETTER_SPOKEN: Record<string, string> = {
  A: "ay", B: "bee", C: "see", D: "dee", E: "ee", F: "eff", G: "jee",
  H: "aitch", I: "eye", J: "jay", K: "kay", L: "el", M: "em", N: "en",
  O: "oh", P: "pee", Q: "cue", R: "ar", S: "ess", T: "tee", U: "you",
  V: "vee", W: "double you", X: "ex", Y: "why", Z: "zee",
};

const DIGIT_SPOKEN: Record<string, string> = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
  "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
};

// Word -> single letter. Includes canonical names and common homophones.
const LETTER_WORD: Record<string, string> = {
  ay: "A", aye: "A", eh: "A", hey: "A", a: "A",
  bee: "B", be: "B", b: "B",
  see: "C", sea: "C", cee: "C", c: "C",
  dee: "D", d: "D",
  ee: "E", e: "E",
  eff: "F", ef: "F", f: "F",
  gee: "G", jee: "G", g: "G",
  aitch: "H", haitch: "H", h: "H",
  eye: "I", i: "I",
  jay: "J", j: "J",
  kay: "K", k: "K",
  el: "L", ell: "L", l: "L",
  em: "M", m: "M",
  en: "N", n: "N",
  pee: "P", pea: "P", p: "P",
  cue: "Q", queue: "Q", q: "Q",
  ar: "R", are: "R", r: "R",
  ess: "S", es: "S", s: "S",
  tee: "T", tea: "T", t: "T",
  vee: "V", v: "V",
  ex: "X", x: "X",
  why: "Y", y: "Y",
  zee: "Z", zed: "Z", z: "Z",
  oh: "O", o: "O", // ambiguous with digit 0; confusion table repairs it
  you: "U", u: "U",
};

// Word -> single digit. Includes homophones ("won", "to", "ate", "oh").
const DIGIT_WORD: Record<string, string> = {
  zero: "0", oh: "0", o: "0", nought: "0",
  one: "1", won: "1", wun: "1",
  two: "2", to: "2", too: "2",
  three: "3", tree: "3",
  four: "4", for: "4", fore: "4",
  five: "5",
  six: "6", sicks: "6",
  seven: "7",
  eight: "8", ate: "8",
  nine: "9", nighn: "9",
  // Multi-digit row words (racks go to row 99). Compound tens like
  // "twenty one" arrive as two tokens and are out of scope here.
  ten: "10", eleven: "11", twelve: "12", thirteen: "13", fourteen: "14",
  fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19",
  twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60",
  seventy: "70", eighty: "80", ninety: "90",
};

/** Tokenize into maximal runs of letters or digits, lower-cased. */
function tokenize(raw: string): string[] {
  return (raw.toLowerCase().match(/[a-z]+|\d+/g) ?? []);
}

/**
 * Collapse a noisy transcript into a compact slot candidate like "A3".
 * Heuristic: the FIRST token is treated as the column letter, the REST as the
 * row digits. Digit/letter homophones are resolved by that position, and the
 * confusion table later repairs anything this guesses wrong.
 */
export function normalizeSpoken(raw: string): string {
  const tokens = tokenize(raw);
  if (tokens.length === 0) return "";

  const out: string[] = [];
  tokens.forEach((tok, idx) => {
    const wantLetter = idx === 0;
    if (/^\d+$/.test(tok)) {
      // Pure digits: keep as digits, unless they sit in the letter slot and map
      // to a letter via confusion (e.g. "8" heard for "A").
      if (wantLetter) out.push(digitToLetterGuess(tok));
      else out.push(...tok.split(""));
      return;
    }
    if (wantLetter) {
      out.push(LETTER_WORD[tok] ?? DIGIT_WORD[tok] ?? tok[0].toUpperCase());
    } else {
      out.push(DIGIT_WORD[tok] ?? LETTER_WORD[tok] ?? "");
    }
  });

  return out.join("");
}

/** Map a lone digit sitting in the letter position to its likeliest letter. */
function digitToLetterGuess(digit: string): string {
  // Find a letter whose confusion list contains this digit (e.g. A<->8, O<->0).
  for (const [canon, entries] of Object.entries(confusionTable)) {
    if (canon.length !== 1 || !/[A-Z]/.test(canon)) continue;
    if (entries.some((e) => e.match === digit)) return canon;
  }
  return digit; // fall back to the digit itself
}

/** Build a space-joined pronounceable expansion of a slot, e.g. "A3" -> "ay three". */
function slotSpokenForm(slot: string): string {
  return slot
    .toUpperCase()
    .split("")
    .map((ch) => LETTER_SPOKEN[ch] ?? DIGIT_SPOKEN[ch] ?? ch)
    .join(" ");
}

/** Metaphone code of a whole phrase (per-token, concatenated). */
function phoneticCode(text: string): string {
  return tokenize(text)
    .map((t) => {
      try {
        return metaphone(t);
      } catch {
        return t.toUpperCase();
      }
    })
    .join("");
}

/** Normalized similarity in [0,1] from Levenshtein distance. */
function editSimilarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - distance(a, b) / max;
}

/**
 * Is `heard` a known confusion for canonical token `canon`? Checks both
 * directions (canon->heard and heard->canon) and returns the max weight, 0 if
 * none. Comparison is case-insensitive on single chars.
 */
function confusionWeight(canon: string, heard: string): number {
  if (canon === heard) return 1;
  let w = 0;
  const a = confusionTable[canon];
  if (a) for (const e of a) if (e.match.toUpperCase() === heard.toUpperCase()) w = Math.max(w, e.weight);
  const b = confusionTable[heard];
  if (b) for (const e of b) if (e.match.toUpperCase() === canon.toUpperCase()) w = Math.max(w, e.weight);
  return w;
}

/**
 * Per-character confusion score between an equal-length candidate and slot.
 * Each position contributes 1 for an exact match, the confusion weight for a
 * known misrecognition, else 0. Returns the average, or null if lengths differ.
 */
function confusionScore(cand: string, slot: string): number | null {
  if (cand.length !== slot.length || cand.length === 0) return null;
  let sum = 0;
  for (let i = 0; i < slot.length; i++) {
    sum += confusionWeight(slot[i].toUpperCase(), cand[i].toUpperCase());
  }
  return sum / slot.length;
}

export interface SlotGuess {
  slot: string;
  confidence: number;
}

/**
 * Correct a noisy transcribed slot ("hey three", "be too", "see oh") onto the
 * best-matching valid slot, combining the confusion table, edit distance
 * (fastest-levenshtein) and phonetic matching (talisman Metaphone).
 *
 * @param rawText    Raw STT transcript for a single slot.
 * @param validSlots The rack's valid slot ids, e.g. ["A1","A2",...,"Z99"].
 * @returns The best slot and a confidence in [0,1]. Empty input or empty slot
 *          list yields { slot: "", confidence: 0 }.
 */
export function correctSlotGuess(rawText: string, validSlots: string[]): SlotGuess {
  if (!rawText.trim() || validSlots.length === 0) {
    return { slot: "", confidence: 0 };
  }

  const cand = normalizeSpoken(rawText);
  const rawNorm = rawText.toLowerCase().replace(/\s+/g, " ").trim();
  const rawPhon = phoneticCode(rawText);

  let best: SlotGuess = { slot: validSlots[0], confidence: -1 };

  for (const slot of validSlots) {
    const slotU = slot.toUpperCase();

    // Exact compound-transcript hit -> high-confidence shortcut.
    const compound = confusionTable[slotU];
    const compoundHit =
      compound?.some((e) => e.match === rawNorm) ?? false;

    const edit = editSimilarity(cand.toUpperCase(), slotU);
    const phon = editSimilarity(rawPhon, phoneticCode(slotSpokenForm(slotU)));
    const conf = confusionScore(cand, slotU);

    let score: number;
    if (conf !== null) {
      score = 0.4 * edit + 0.25 * phon + 0.35 * conf;
    } else {
      // Length mismatch: confusion alignment unavailable, lean on edit+phonetic.
      score = 0.6 * edit + 0.4 * phon;
    }
    if (compoundHit) score = Math.max(score, 0.9);

    if (score > best.confidence) best = { slot, confidence: score };
  }

  best.confidence = Math.max(0, Math.min(1, Number(best.confidence.toFixed(3))));
  return best;
}
