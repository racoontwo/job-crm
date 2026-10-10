// Registry of job board / ATS hosts the paste-URL flow knows about.
// "working" / "blocked" are only set once someone has actually verified
// fetching against that host (see lastVerified) — everything else is
// "unverified" rather than assumed to work.
export type JobSourceStatus = "working" | "blocked" | "unverified";

export type JobSource = {
  domain: string;
  label: string;
  status: JobSourceStatus;
  note?: string;
  lastVerified?: string; // ISO date, only present once actually checked
};

export const JOB_SOURCES: JobSource[] = [
  {
    domain: "glassdoor.com",
    label: "Glassdoor",
    status: "blocked",
    note: "Glassdoor blocks automated requests (HTTP 403) — fill this one in by hand.",
    lastVerified: "2026-09-27",
  },
  {
    domain: "upwork.com",
    label: "Upwork",
    status: "blocked",
    note: "Upwork blocks the app (HTTP 403) — the title is read from the link. Use the userscript's import button in your browser, or paste the description in by hand.",
    lastVerified: "2026-10-10",
  },
  { domain: "linkedin.com", label: "LinkedIn", status: "working", lastVerified: "2026-09-27" },
  {
    domain: "indeed.com",
    label: "Indeed",
    status: "blocked",
    note: "Indeed's bot detection blocks the app (HTTP 401) — open the posting in your browser on the laptop and use the userscript's import button, or fill this in by hand.",
    lastVerified: "2026-10-10",
  },
  { domain: "greenhouse.io", label: "Greenhouse", status: "unverified" },
  { domain: "lever.co", label: "Lever", status: "unverified" },
  { domain: "ashbyhq.com", label: "Ashby", status: "unverified" },
  { domain: "workday.com", label: "Workday", status: "unverified" },
  { domain: "myworkdayjobs.com", label: "Workday", status: "unverified" },
  { domain: "smartrecruiters.com", label: "SmartRecruiters", status: "unverified" },
  { domain: "breezy.hr", label: "Breezy", status: "unverified" },
  { domain: "wellfound.com", label: "Wellfound", status: "unverified" },
  { domain: "teamtailor.com", label: "Teamtailor", status: "unverified" },
];

export function findJobSource(hostname: string): JobSource | undefined {
  const host = hostname.replace(/^www\./, "");
  return JOB_SOURCES.find((s) => host === s.domain || host.endsWith(`.${s.domain}`));
}

export function inferSourceLabel(hostname: string): string {
  return findJobSource(hostname)?.label ?? hostname.replace(/^www\./, "");
}
