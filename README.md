# Job CRM

A local-first tracker for job applications: which companies you've applied to,
current status, full status history per application, and follow-up reminders.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS
- Drizzle ORM + better-sqlite3 (local file DB, no external service — `job-crm.db`
  is created next to the project when you first run it)

Prisma was the original plan but its query-engine binaries need to be
downloaded from `binaries.prisma.sh` at install/build time, which isn't
always reachable in restricted network setups. Drizzle + better-sqlite3
gives the same TypeScript-first experience with zero external binary
downloads (everything compiles from npm), so it was used instead. If you
have unrestricted internet and prefer Prisma, swapping it back in is a
contained change — `lib/db/schema.ts` and `lib/db/index.ts` are the only
files it touches.

## Getting started

```bash
npm install
npx drizzle-kit push   # creates job-crm.db and applies the schema
npm run dev
```

Then open http://localhost:3000.

## Cloud storage (optional)

By default everything lives in the local `job-crm.db` SQLite file. To move to
MongoDB Atlas instead, copy `.env.example` to `.env.local` and fill in
`MONGODB_URI` (from Atlas: Database > Connect > Drivers). Once it's set and
reachable, the app reads and writes live Mongo data automatically — no code
changes needed. A toast in the bottom-right corner always shows which backend
is active. Leave `MONGODB_URI` unset to keep using local SQLite.

The two backends are wired up in `lib/actions/actions.ts`, which checks
connectivity (`lib/db/mongoStatus.ts`) on every call and routes to whichever
store is live. Mongo's document shapes are in `lib/db/mongoCollections.ts` —
status events and follow-ups are embedded arrays on the application document
rather than separate collections, since they're always read/written together
with their parent application.

## Cover letters

Each application has a "Cover letter" section with a **Generate** button that
drafts a letter tailored to that specific role, then lets you edit it before
saving.

Generation uses the **Gemini API** (`@google/genai`), not Anthropic — set
`GEMINI_API_KEY` in `.env.local`; the free tier covers personal use. Everything
else in the app works without it. Don't add an `@anthropic-ai/sdk` dependency
for this; it was a deliberate choice.

### Two providers: Gemini or the Claude CLI

The **Generate** button has a provider dropdown. **Claude (local CLI)** is the
default — it shells out to the `claude` CLI, the same Claude Code binary used
interactively, in non-interactive `-p` (print) mode, piping it the exact same
assembled prompt Gemini receives and reading its reply back as the letter
text. **Gemini** (above) is the alternative.

This calls the CLI as a subprocess (`node:child_process`), not the Anthropic
API directly — no `@anthropic-ai/sdk` or any new dependency is added, and this
app never handles an Anthropic API key. Authentication is whatever the local
`claude` CLI is already logged into.

Prerequisite: `claude` must be installed and authenticated on whichever
machine runs `npm run dev` (`claude /status` to check).

This does **not** rely on `claude` being on the dev server process's PATH —
the process running `npm run dev` (e.g. launched from an editor/extension)
can have a narrower PATH than your Terminal, so `claude` working when you
type it doesn't guarantee this app can find it the same way. It checks the
native installer's fixed location (`~/.local/bin/claude`) and common
Homebrew paths automatically. If it's installed somewhere else, set
`CLAUDE_CLI_PATH` in `.env.local` to the full path (find it with
`which claude` in the terminal where `claude` works).

### It learns as you go

Gemini is stateless — it remembers nothing between calls. The memory lives in
this app instead: **every application with a saved cover letter becomes a
few-shot example** for the next generation, passed in alongside the job it was
written for.

Because what's stored is whatever you last *saved*, editing a draft before
saving is what teaches the next one. Letters get more like your voice the more
you use it, with no training step.

### The `profile/` directory

The **Settings** page (`/settings`) edits all of this through the browser —
textareas for `resume.md`/`writing-style.md`, and upload/delete for
`notes/`/`examples/`. Editing the files directly on disk works too; the page
just reads/writes the same files. Either way, `profile/` is gitignored — this
repo is public, so none of it ever leaves your machine.

It holds two required files:

- **`profile/resume.md`** — your background. Headings: Basics, Summary, Skills,
  Experience, Education, Languages, Certifications, Stories worth reusing,
  Constraints. The generator may use *only* facts that appear here — it's
  instructed never to invent employers, dates, or metrics — so anything missing
  won't show up in a letter.
- **`profile/writing-style.md`** — the hard rules: language, tone, length,
  structure, banned phrases, signature. These override anything the model would
  otherwise pick up from past examples, so this is where you correct a letter
  that came out wrong.
- **`profile/notes/`** *(optional)* — any number of `.md` files with extra
  background the generator should know about (side projects, deeper stories,
  domain-specific context) without cluttering `resume.md`. Every file in this
  folder is read and appended to the resume as additional background; add,
  edit, or remove files anytime. Missing this folder entirely is fine — it's
  not required like the two files above.
- **`profile/examples/`** *(optional)* — past cover letters you've written
  outside this app, one per file (`.md` or `.txt`), whole file content is the
  letter as-is. These are always combined with the app's own database-driven
  examples (see "It learns as you go" above) as extra few-shot material. Up to
  6 files are used, read in alphabetical order — name-prefix them (`01-`, `02-`
  …) if you want to control which ones are picked when you have more than 6.

## Data model

- **companies** — name, website, industry, notes, interest level (1-5 stars)
- **applications** — role title, source, applied date, job URL, current status
- **status_events** — one row per status change (Applied, Screening,
  Interviewing, Offer, Rejected, Withdrawn, or any custom label) — this is
  what powers the timeline on each application's detail page
- **follow_ups** — due date + note + done flag, shown on the dashboard as a
  badge when an application has open follow-ups

## Useful scripts

- `npm run dev` — start the dev server
- `npm run build` / `npm run start` — production build + serve
- `npm run db:generate` — generate a new migration after editing
  `lib/db/schema.ts`
- `npm run db:push` — push schema changes to the local DB directly
  (fine for solo/local use; use generate+migrate if you want versioned
  migration files)
- `npm run db:studio` — Drizzle Studio, a local GUI to browse/edit the DB

## Notes on the current stages

Status is stored as free text, seeded with:
`Applied → Screening → Interviewing → Offer / Rejected / Withdrawn`

Multiple interview rounds are modeled as separate status_events at the
"Interviewing" stage with different notes (e.g. "1st round - tech",
"Final w/ CTO") rather than as separate schema states — keeps the schema
simple while still giving you a full history per round.
