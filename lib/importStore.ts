// Transient handoff for job data captured client-side (e.g. by a userscript
// running in the user's own logged-in browser on a site our server can't
// fetch, like Glassdoor — see lib/jobSources.ts). A POST to /api/import-job
// stashes the payload here; the /applications/new?import=<id> page consumes
// it once to pre-fill the normal review screen. Single-use and short-lived
// so a stale link can't resurrect old data.
import { randomUUID } from "node:crypto";
import type { ExtractedJobPosting } from "./jobPosting";

export type JobImportPayload = {
  companyName?: string;
  companyWebsite?: string;
  industry?: string;
  roleTitle?: string;
  roleDescription?: string;
  source?: string;
  jobUrl: string;
};

const TTL_MS = 10 * 60 * 1000;

type StoredImport = { payload: JobImportPayload; expiresAt: number };

// Route handlers and server components can end up in separate module
// instances under Next.js's dev bundling, so a plain module-level Map isn't
// reliably shared between the POST here and the page that reads it back —
// same issue (and same fix) as the usual Prisma-client-in-dev singleton.
const globalStore = globalThis as unknown as { __jobImportStore?: Map<string, StoredImport> };
const store = globalStore.__jobImportStore ?? (globalStore.__jobImportStore = new Map());

function purgeExpired() {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (entry.expiresAt < now) store.delete(id);
  }
}

export function createImport(payload: JobImportPayload): string {
  purgeExpired();
  const id = randomUUID();
  store.set(id, { payload, expiresAt: Date.now() + TTL_MS });
  return id;
}

export function consumeImport(id: string): ExtractedJobPosting | null {
  purgeExpired();
  const entry = store.get(id);
  if (!entry) return null;
  store.delete(id);
  const p = entry.payload;
  return {
    companyName: p.companyName?.trim() ?? "",
    companyWebsite: p.companyWebsite?.trim() ?? "",
    industry: p.industry?.trim() ?? "",
    roleTitle: p.roleTitle?.trim() ?? "",
    roleDescription: p.roleDescription?.trim() ?? "",
    source: p.source?.trim() || "Glassdoor",
    jobUrl: p.jobUrl,
    interestLevel: 3,
  };
}
