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
  - **Spreadsheet** — an editable table with a column per field.
- **Custom field schema** — beyond the primary label, define per-project fields
  (text / number / date / enum). Add columns/fields from **either** view; they
  stay in sync. Fields are seeded from a per-user default template and can be
  pushed back up with **"Save as my default fields."** Removing a field
  soft-deletes (archives) its values.
- **Voice control** (browser Web Speech API, on-device, no audio leaves the
  machine; Chrome/Edge):
  - **Fill** — *"Slot A3, type control, owner Sarah"* — field/value pairs in
    **any order**, matched to your fields with phonetic/fuzzy matching
    (`tag`→Type, `order`→Owner). Untagged values fall back to field display
    order and are flagged in the readback.
  - **Update one field** — *"change A3 type to flagged"* — a single-field patch.
  - **Query** — *"what is in slot B3"* — reads the label + all field values back
    via text-to-speech.
  - **Confirmation handshake** (toggleable in Settings) — reads the entry back,
    auto-opens the mic for a spoken **yes / no**, and only commits on "yes".
  - **Hold `Space`** to talk (push-to-talk, continuous capture so pauses don't
    cut you off), or click the mic.
- **Settings** (`/settings`) — account email, voice confirmation toggle, and the
  default-field manager.
- **Export** a rack to **CSV / XLSX / PDF**.
- **PWA** — installable (next-pwa).

## Tech stack

Next.js 15 (App Router) · TypeScript · tRPC v11 · Prisma + PostgreSQL · NextAuth
v4 (magic link via Resend) · Tailwind CSS · next-pwa · Vitest.

The voice parser and intent classifier are **deterministic plain code (no LLM)** —
see `src/lib/voice/`.

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
  voice/
    parser.ts                Deterministic set/query parser (+ tests)
    classify.ts              classify_and_parse intent classifier (+ tests)
    vocabulary.ts            Phonetic confusion table + fuzzy field matching
    speech.ts                Web Speech API wrappers (STT/TTS)
src/components/              UI (RackGrid, SlotDetailCard, SpreadsheetView, …)
src/app/                     Routes (dashboard, projects, racks, settings, api)
```

## Testing

```bash
npm test          # 29 tests: grid round-trips, voice parsing, intent classifier
```

## Roadmap / notes

- Voice currently relies on mic permission granted on first push-to-talk
  (Chrome remembers it for the session).
- The "confirm before commit" voice flow commits on a spoken "yes"; field/value
  fill and single-field updates are both supported.
