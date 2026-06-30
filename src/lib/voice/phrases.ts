// Pregenerated phrasings the deterministic parser understands. These are NOT fed
// to an LLM — they are compiled into regexes in parser.ts. `{pos}` marks where a
// slot token (e.g. "A3", "b 12") is expected.

// --- Setting a label ---
// Canonical form requested in the spec: "Slot: A3, Label: Control sample".
// We accept many spoken variants where the slot comes first and the label is the
// remainder of the utterance.
export const SET_PHRASES: string[] = [
  "slot {pos} label {label}",
  "slot {pos} is {label}",
  "slot {pos} contains {label}",
  "set slot {pos} to {label}",
  "set slot {pos} label {label}",
  "label slot {pos} as {label}",
  "label slot {pos} {label}",
  "put {label} in slot {pos}",
  "{pos} label {label}",
  "{pos} is {label}",
];

// --- Querying a slot ---
export const QUERY_PHRASES: string[] = [
  "what is in slot {pos}",
  "what's in slot {pos}",
  "what is in {pos}",
  "what's in {pos}",
  "what is slot {pos}",
  "what's slot {pos}",
  "whats in slot {pos}",
  "whats in {pos}",
  "read slot {pos}",
  "read {pos}",
  "contents of slot {pos}",
  "contents of {pos}",
  "tell me slot {pos}",
  "tell me about slot {pos}",
  "what's the label for slot {pos}",
  "what is the label for slot {pos}",
];
