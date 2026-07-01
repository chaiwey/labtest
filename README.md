# LabTest

Voice-assisted labeling for lab test-tube racks. Once a tube is in a rack you can
only see its cap — LabTest keeps each rack's contents in a database you fill and
query **by voice**, hands-free at the bench, and view as a visual diagram or an
editable spreadsheet.

## Features

- **Magic-link auth** (NextAuth + Resend) — no passwords.
- **Projects → racks** with spreadsheet-style coordinates (lettered columns,
  numbered rows: `A3`, `C6`).
- **Two synced views** of a rack:
  - **Diagram** — a size-adaptive circle grid (small strips to 16×24 freezer
    racks). Hover a slot to preview it in a side card; click to edit.
  - **Spreadsheet** — an **Excel-like** editable grid: click/drag to select,
    arrow/Tab/Enter to navigate, edit in place, **copy/paste** (TSV, works with
    real Excel/Sheets), **undo/redo** (⌘Z/⌘Y, incl. column resizes), a
    **fill handle** ("magic drag") with content-driven series detection
    (`1,2,3`→`4,5,6`; dates step by day; Alt-drag to copy), **drag-to-resize**
    columns (persisted), a **right-click menu** to insert/rename/delete a field,
    and a sliding selection outline.
- **Custom field schema** — every column is a per-project field
  (text / number / date / percent / enum). The first field, **Label**, is seeded
  by default and shown as each slot's summary in the diagram and exports, but is
  otherwise a normal field — rename, reorder, or delete it like any other (a rack
  keeps at least one field). Add fields from **either** view; they stay in sync,
  are seeded from a per-user default template, and can be pushed back up with
  **"Save as my default fields."** Removing a field soft-deletes (archives) its
  values.
- **Voice control** (cloud speech-to-text via **Groq-hosted Whisper**; works in
  any browser that can record audio, not just Chrome/Edge). Audio is recorded in
  the browser and transcribed server-side — the `GROQ_API_KEY` never reaches the
  client:
  - **Fill** — *"Slot A3, label control, owner Sarah"* — field/value pairs in
    **any order**, matched to your fields with phonetic/fuzzy matching. Untagged
    values fall back to field display order and are flagged in the readback.
  - **Update one field** — *"change A3 type to flagged"* — a single-field patch.
  - **Query** — *"what is in slot B3"* — reads all field values back via
    text-to-speech.
  - **Confirmation handshake** (toggleable in Settings) — reads the entry back,
    auto-opens the mic for a spoken **yes / no** (silence auto-stops the
    recording), and only commits on "yes".
  - **Hold `Space`** to talk (push-to-talk), or click the mic. A phonetic slot
    confusion table corrects common misrecognitions of spoken letters/digits.
- **Settings** (`/settings`) — account email, voice confirmation toggle, and the
  default-field manager.
- **Export** a rack to **CSV / XLSX / PDF**.
- **PWA** — installable (next-pwa).

## Tech stack

Next.js 15 (App Router) · TypeScript · tRPC v11 · Prisma + PostgreSQL · NextAuth
v4 (magic link via Resend) · Tailwind CSS · next-pwa · Vitest. Speech-to-text via
Groq-hosted Whisper (`whisper-large-v3-turbo`); phonetic matching via `talisman`,
edit distance via `fastest-levenshtein`.

The voice parser and intent classifier are **deterministic plain code (no LLM)** —
see `src/lib/voice/`. Only the raw transcription uses Whisper.

## Getting started

Prerequisites: Node 20+, Docker (for local Postgres).

```bash
# 1. install
npm install

# 2. env
cp .env.example .env            # adjust if needed

# 3. database (Postgres in Docker, host port 5433)
docker compose up -d
npx prisma migrate dev

# 4. run
npm run dev                     # http://localhost:3000
```

**Signing in (local dev):** enter any email on `/signin`. No real email is sent
unless `RESEND_API_KEY` is set — the magic-link URL is printed to the **dev server
console**; open it to sign in.

**Voice input:** set `GROQ_API_KEY` in `.env` (get one at
<https://console.groq.com/keys>) to enable transcription. Voice needs a mic and a
secure context (`localhost` or HTTPS).

> Note: local Postgres is mapped to host port **5433** (not 5432) to avoid clashing
> with other local DBs. The connection string in `.env.example` matches.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Run Vitest (grid, voice parser, classifier) |
| `npm run db:up` / `db:down` | Start / stop the Postgres container |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:studio` | Prisma Studio |

## Project layout

```
prisma/schema.prisma         Data model (User, Project, Rack, Slot, field schema)
src/server/                  tRPC: context/auth + routers
  routers/                   project, rack, slot, field, userSettings
src/lib/
  grid.ts                    Coordinate helpers (A3 <-> row/col)
  export.ts                  CSV / XLSX / PDF
  fields.ts                  Field types + value normalization (dates, %, …)
  spreadsheet.ts             TSV clipboard + fill-series helpers (+ tests)
  confusionTable.ts          Phonetic slot-guess corrector (+ tests)
  voice/
    parser.ts                Deterministic set/query parser (+ tests)
    classify.ts              classify_and_parse intent classifier (+ tests)
    vocabulary.ts            Phonetic confusion table + fuzzy field matching
    speech.ts                MediaRecorder capture + TTS (posts to /api/transcribe)
src/app/api/transcribe/      Server route → Groq Whisper (key stays server-side)
scripts/migrate-label-to-field.ts   One-off: slot.label → a "Label" field
src/components/              UI (RackGrid, SlotDetailCard, SpreadsheetView, …)
src/app/                     Routes (dashboard, projects, racks, settings, api)
```

## Testing

```bash
npm test          # grid round-trips, voice parsing/classifier, date parsing,
                  # spreadsheet TSV + fill-series, slot-guess corrector
```

## Roadmap / notes

- Voice relies on mic permission granted on first push-to-talk, and on a Groq API
  key being configured server-side.
- The "confirm before commit" voice flow commits on a spoken "yes"; field/value
  fill and single-field updates are both supported.
- `slot.label` is retained (dormant) after the Label→field migration; it can be
  dropped in a future schema cleanup.
