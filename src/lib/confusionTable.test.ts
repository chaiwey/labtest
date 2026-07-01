// Test cases for correctSlotGuess. Each feeds an intentionally noisy STT
// transcript plus the rack's valid slot list and asserts the corrector lands on
// the intended slot. We assert the chosen slot (the deterministic part) and that
// confidence clears a floor.

import { describe, it, expect } from "vitest";
import { correctSlotGuess } from "./confusionTable";

// A small but representative rack: columns A–E, rows 1–10, plus a few far slots
// so the matcher has real alternatives to reject.
const RACK: string[] = [];
for (const col of ["A", "B", "C", "D", "E"]) {
  for (let r = 0; r <= 10; r++) RACK.push(`${col}${r}`);
}
RACK.push("Z99", "M5", "N5", "S7", "F7");

interface Case {
  name: string;
  raw: string;
  expect: string;
  minConfidence?: number;
}

const CASES: Case[] = [
  { name: "'hey three' -> A3 (A/H homophone)", raw: "hey three", expect: "A3" },
  { name: "'a three' spoken naturally -> A3", raw: "a three", expect: "A3" },
  { name: "'8 3' -> A3 (eight/ay)", raw: "8 3", expect: "A3" },
  { name: "'be too' -> B2 (be/bee, too/two)", raw: "be too", expect: "B2" },
  // V column absent from rack, so V/B confusion must route "vee four" to B4.
  { name: "'vee four' -> B4 (V/B confusion)", raw: "vee four", expect: "B4" },
  { name: "'see oh' -> C0 (oh/zero)", raw: "see oh", expect: "C0" },
  { name: "'sea zero' -> C0", raw: "sea zero", expect: "C0" },
  { name: "'e ate' -> E8 (ate/eight)", raw: "e ate", expect: "E8" },
  { name: "'ee eight' -> E8", raw: "ee eight", expect: "E8" },
  { name: "'dee ten' -> D10", raw: "dee ten", expect: "D10" },
  { name: "'em five' -> M5 (M/N nasal)", raw: "em five", expect: "M5" },
  { name: "'en five' stays N5", raw: "en five", expect: "N5" },
  { name: "'eff seven' -> F7 (S/F)", raw: "eff seven", expect: "F7" },
  { name: "'won' digit -> A1", raw: "ay won", expect: "A1" },
  { name: "'oh' as zero -> A0", raw: "ay oh", expect: "A0" },
  { name: "'nine' end-sound vs five -> E9", raw: "ee nine", expect: "E9" },
  { name: "already-clean 'B4'", raw: "B4", expect: "B4" },
  { name: "spaced clean 'c 5'", raw: "c 5", expect: "C5" },
];

describe("correctSlotGuess — noisy STT → valid slot", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const got = correctSlotGuess(c.raw, RACK);
      expect(got.slot).toBe(c.expect);
      expect(got.confidence).toBeGreaterThanOrEqual(c.minConfidence ?? 0.5);
    });
  }
});
