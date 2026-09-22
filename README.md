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
