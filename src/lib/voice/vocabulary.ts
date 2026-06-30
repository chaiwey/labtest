// Field-name vocabulary + fuzzy/phonetic matching for the voice classifier.
// Pure code, no LLM. Extends the idea of a phonetic confusion table to cover
// project field names (e.g. "type" vs "tag", "owner" vs "order").

export type FieldType = "text" | "number" | "date" | "enum";

export interface FieldDef {
  id: string;
  name: string;
  type?: FieldType;
  displayOrder: number;
}

export type MatchVia = "name" | "phonetic" | "fuzzy";

export interface FieldMatch {
  field: FieldDef;
  score: number; // 0..1
  via: MatchVia;
}

// Groups of words that speech-to-text / human speech commonly confuse. Any two
// words in the same group are treated as phonetically interchangeable.
export const PHONETIC_GROUPS: string[][] = [
  ["type", "tag", "tight", "time", "tape", "types"],
  ["owner", "order", "honor", "odor", "owners", "owned"],
  ["label", "libel", "labels", "labour"],
  ["date", "data", "dates", "gate", "dated"],
  ["name", "names", "nain", "neighm"],
  ["status", "state", "statuses", "stat"],
  ["concentration", "conc", "concentrate", "concentrations"],
  ["volume", "value", "vol", "volumes"],
  ["sample", "samples", "simple", "sampled"],
  ["note", "notes", "no", "nope"],
  ["color", "colour", "caller", "collar"],
  ["box", "bucks", "blocks", "ox"],
  ["batch", "badge", "back"],
  ["passage", "package", "passages"],
];

export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

interface Enriched {
  field: FieldDef;
  base: string;
  aliases: Set<string>; // includes base + phonetic variants
}

export interface VocabularyIndex {
  fields: FieldDef[];
  /**
   * Best field for a spoken candidate (1–3 words). Returns null below `floor`.
   * `via`: name = exact, phonetic = confusion-table hit, fuzzy = edit-distance.
   */
  matchField: (candidate: string, floor?: number) => FieldMatch | null;
}

export function buildVocabularyIndex(fields: FieldDef[]): VocabularyIndex {
  const enriched: Enriched[] = fields.map((field) => {
    const base = norm(field.name);
    const words = base.split(" ");
    const aliases = new Set<string>([base]);
    words.forEach((word) => {
      PHONETIC_GROUPS.forEach((group) => {
        if (group.includes(word)) {
          group.forEach((alt) => {
            aliases.add(alt); // single-word alias
            aliases.add(words.map((w) => (w === word ? alt : w)).join(" "));
          });
        }
      });
    });
    return { field, base, aliases };
  });

  function matchField(candidate: string, floor = 0.6): FieldMatch | null {
    const c = norm(candidate);
    if (!c) return null;
    let best: FieldMatch | null = null;
    for (const e of enriched) {
      let score = 0;
      let via: MatchVia = "fuzzy";
      if (c === e.base) {
        score = 1;
        via = "name";
      } else if (e.aliases.has(c)) {
        score = 0.9;
        via = "phonetic";
      } else {
        // best edit-distance similarity over base + aliases
        let sim = 0;
        for (const a of e.aliases) sim = Math.max(sim, similarity(c, a));
        score = sim;
        via = "fuzzy";
      }
      if (score >= floor && (!best || score > best.score)) {
        best = { field: e.field, score, via };
      }
    }
    return best;
  }

  return { fields, matchField };
}
