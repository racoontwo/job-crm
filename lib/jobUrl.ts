// One place that decides what a job posting's URL "is", so the same job
// shared twice (from the phone, pasted, or via the userscript) is recognised
// as the same job.

// Query params that only track where a click came from. Anything not listed
// here is kept — some sites put the job id in the query (Indeed's ?jk=).
const TRACKING_PARAMS = new Set([
  "from", // Indeed: appshareandroid, serp, ...
  "trk",
  "trkInfo",
  "refId",
  "trackingId",
  "lipi",
  "originalSubdomain",
  "ref",
  "src",
  "gclid",
  "fbclid",
  "mc_cid",
  "mc_eid",
]);

// Cleans a job URL for storing and fetching: rewrites LinkedIn search-result
// links to the posting itself, drops tracking params and the #fragment.
export function cleanJobUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw.trim();
  }

  const host = url.hostname.replace(/^www\./, "");

  // LinkedIn's "copy link" from a job search results page produces a
  // /jobs/search-results/?currentJobId=... URL, which requires a logged-in
  // session and redirects to a sign-in wall. The canonical /jobs/view/<id>
  // URL for the same posting is public.
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    const jobId =
      url.searchParams.get("currentJobId") ?? url.pathname.match(/^\/jobs\/view\/(?:[^/]*-)?(\d+)/)?.[1];
    if (jobId) return `https://www.linkedin.com/jobs/view/${jobId}`;
  }

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key) || key.startsWith("utm_")) url.searchParams.delete(key);
  }
  url.hash = "";
  return url.toString();
}

// Comparison key: the cleaned URL without scheme, "www." or a trailing slash,
// so http/https and www/no-www variants of the same posting match.
export function jobUrlKey(raw: string): string {
  const cleaned = cleanJobUrl(raw);
  try {
    const url = new URL(cleaned);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname.replace(/\/+$/, "");
    return `${host}${path}${url.search}`;
  } catch {
    return cleaned.toLowerCase();
  }
}
