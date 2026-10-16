// Two kinds of posting, two kinds of letter:
//
//   job        ─ a long-term position (Indeed, Glassdoor, LinkedIn, a company's
//                own careers page): a longer, formal cover letter, laid out as a letter.
//   freelance  ─ a gig on a freelance marketplace (Upwork, Fiverr, …): a short,
//                casual proposal whose only job is to win the contract quickly.
//
// No database column: the kind follows from the application's source label,
// so a freelance posting is saved with a freelance source ("Upwork", or
// "Freelance" when the platform isn't known). Client-safe — no node imports.

import { JOB_SOURCES, findJobSource } from "./jobSources";

export type PostingKind = "job" | "freelance";

export const POSTING_KIND_LABELS: Record<PostingKind, { name: string; letter: string }> = {
  job: { name: "Job", letter: "formal cover letter" },
  freelance: { name: "Freelance gig", letter: "short proposal" },
};

// What the generator (lib/coverLetterGenerator.ts) and Claude Desktop
// (mcp/server.ts) are told about the letter's length and shape. The user's
// own writing-style file still sets the voice.
export const LETTER_FORMATS: Record<PostingKind, string> = {
  job: `This is a long-term position, so write a formal cover letter, laid out as a letter:
- Open with a greeting — to the contact person by name if the posting gives one, otherwise a general greeting in the posting's language.
- 300–450 words in 4–5 paragraphs: why this role and company, the most relevant experience with concrete examples, what the person would bring to the team, and a closing paragraph that asks for an interview.
- End with a formal sign-off and the person's full name.
- Professional and formal register, but still personal and specific — no clichés or filler.`,
  freelance: `This is a gig on a freelance marketplace, so write a short proposal message, not a letter. The goal is to land the contract quickly.
- No "Dear…", no subject line, no formal letter layout. A short "Hi," (or "Hi <name>," if the client's name is given) is fine.
- 80–150 words, casual and straight to the point.
- Open with the client's problem and that the person can solve it — not with a self-introduction.
- Then one or two concrete, relevant proof points from their background, and in a sentence or two how they would approach this job.
- End with a short call to action, e.g. a question about the project or an offer to start right away. Sign with the first name only.`,
};

const FREELANCE_LABELS = new Set([
  "freelance",
  ...JOB_SOURCES.filter((s) => s.kind === "freelance").map((s) => s.label.toLowerCase()),
]);

export function isFreelanceSource(source: string | null | undefined): boolean {
  return Boolean(source && FREELANCE_LABELS.has(source.trim().toLowerCase()));
}

export function kindOfApplication(app: { source: string | null; jobUrl: string | null }): PostingKind {
  if (isFreelanceSource(app.source)) return "freelance";
  if (app.jobUrl) {
    try {
      if (findJobSource(new URL(app.jobUrl).hostname)?.kind === "freelance") return "freelance";
    } catch {
      // not a URL — fall through
    }
  }
  return "job";
}

// Phrases that only show up on freelance marketplace postings.
const FREELANCE_HINTS =
  /\b(upwork|fiverr|freelancer\.com|peopleperhour|fixed[- ]price|hourly range|proposals?:|connects? to apply|client'?s recent history|payment (method )?verified)\b/i;

export function firstUrl(text: string): string | null {
  return text.match(/https?:\/\/[^\s<>"')\]]+/i)?.[0] ?? null;
}

// For the paste box: a good-enough guess the user can override.
export function guessKindFromText(text: string): PostingKind {
  const url = firstUrl(text);
  if (url) {
    try {
      if (findJobSource(new URL(url).hostname)?.kind === "freelance") return "freelance";
    } catch {
      // ignore
    }
  }
  return FREELANCE_HINTS.test(text) ? "freelance" : "job";
}

// The source label to save, so the kind sticks: the detected platform if it
// agrees with the chosen kind, otherwise a generic one.
export function sourceForKind(kind: PostingKind, detected: string | null): string | null {
  const freelance = isFreelanceSource(detected);
  if (kind === "freelance") return freelance ? detected : "Freelance";
  return freelance ? "Job posting" : detected;
}
