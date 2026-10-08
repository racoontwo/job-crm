// Parses a job posting page for structured data, without any AI/LLM call.
// Primary source: schema.org JobPosting JSON-LD, which most job boards and
// ATS platforms (LinkedIn, Indeed, Greenhouse, Lever, Ashby, ...) embed for
// SEO. Falls back to OpenGraph tags when that's absent.

import http from "node:http";
import https from "node:https";
import { findJobSource, inferSourceLabel } from "./jobSources";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// Next.js/undici's fetch tries IPv6 first and hangs/times out against hosts
// this machine has no IPv6 route to (even though curl and browsers work
// fine over IPv4). Using node:https directly with family: 4 sidesteps it.
function httpsGetFollowingRedirects(
  targetUrl: string,
  maxRedirects = 5
): Promise<{ status: number; body: string; finalUrl: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl);
    const client = u.protocol === "http:" ? http : https;
    const req = client.request(
      {
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        method: "GET",
        family: 4,
        timeout: 10_000,
        headers: { "User-Agent": USER_AGENT },
      },
      (res) => {
        const { statusCode = 0, headers } = res;
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          res.resume();
          if (maxRedirects <= 0) {
            reject(new Error("Too many redirects"));
            return;
          }
          const nextUrl = new URL(headers.location, targetUrl).toString();
          httpsGetFollowingRedirects(nextUrl, maxRedirects - 1).then(resolve, reject);
          return;
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: statusCode, body: data, finalUrl: targetUrl }));
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
    req.on("error", reject);
    req.end();
  });
}

// LinkedIn's "copy link" from a job search results page produces a
// /jobs/search-results/?currentJobId=... URL, which requires a logged-in
// session and redirects to a sign-in wall. The canonical /jobs/view/<id>
// URL for the same posting is public — rewrite to that before fetching.
function normalizeJobUrl(url: URL): URL {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "linkedin.com" && url.pathname.startsWith("/jobs/search-results")) {
    const jobId = url.searchParams.get("currentJobId");
    if (jobId) return new URL(`https://www.linkedin.com/jobs/view/${jobId}`);
  }
  return url;
}

// When a LinkedIn listing has no JobPosting JSON-LD (common — seems to
// depend on the listing, not something we control), fall back to its
// og:title/og:description. Both follow a couple of fixed templates and
// always carry a site-name suffix, so it's worth cleaning up rather than
// showing the raw social-preview text.
function parseLinkedInTitle(ogTitle: string): { roleTitle: string; companyName: string } {
  const title = ogTitle.replace(/\s*\|\s*LinkedIn(?:\s*Jobs)?\s*$/i, "").trim();

  let match = title.match(/^(.+?) hiring (.+?) in .+$/i);
  if (match) return { companyName: match[1].trim(), roleTitle: match[2].trim() };

  match = title.match(/^(.+?) at (.+)$/i);
  if (match) {
    const company = match[2].split(/\s*[—–]\s*/)[0].trim();
    return { companyName: company, roleTitle: match[1].trim() };
  }

  return { companyName: "", roleTitle: title };
}

function cleanLinkedInDescription(ogDescription: string): string {
  // Some listings' og:description is entirely boilerplate ("Apply for <role>
  // at <company> in <location>. <type>. <level> role. See responsibilities,
  // qualifications, and similar jobs on LinkedIn.") with no real description
  // content — just restating fields we already have. Drop it rather than
  // show a sentence that adds nothing.
  if (/^Apply for .+\.\s*See responsibilities, qualifications, and similar jobs on LinkedIn\.?\s*$/i.test(ogDescription)) {
    return "";
  }
  const stripped = ogDescription
    .replace(/^Posted [^.]*\.\s*/i, "")
    .replace(/\s*See (?:this|these) and similar jobs on LinkedIn\.?\s*$/i, "")
    .trim();

  // The "Easy Apply" CTA template ("Please fill out the required fields
  // below...") carries no real job content either — LinkedIn seems to serve
  // this or the "Apply for ..." template above interchangeably for the same
  // listing across requests.
  if (/please fill out the required fields below and click on the submit button to apply for the role/i.test(stripped)) {
    return "";
  }
  return stripped;
}

// LinkedIn's guest (logged-out) job page — the one this app actually
// fetches — server-renders the full description as plain HTML in this
// container, independent of whether JobPosting JSON-LD or a real
// og:description happen to be present. This is the richest source
// available and should be tried before falling back to og:description's
// truncated/boilerplate text.
function extractLinkedInDescriptionHtml(html: string): string | undefined {
  const match = html.match(
    /<div class="show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/section>/i
  );
  return match ? match[1] : undefined;
}

function isLoginWall(finalUrl: string): boolean {
  const path = new URL(finalUrl).pathname;
  return path.startsWith("/uas/login") || path.startsWith("/authwall") || path.startsWith("/login");
}

export type ExtractedJobPosting = {
  companyName: string;
  companyWebsite: string;
  industry: string;
  roleTitle: string;
  roleDescription: string;
  source: string;
  jobUrl: string;
  interestLevel: number;
  warning?: string;
  error?: string;
};

function extractJsonLdObjects(html: string): Record<string, unknown>[] {
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  const objects: Record<string, unknown>[] = [];
  for (const match of scripts) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const items = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { "@graph"?: unknown[] })["@graph"])
        ? (parsed as { "@graph": unknown[] })["@graph"]
        : [parsed];
      for (const item of items) {
        if (item && typeof item === "object") objects.push(item as Record<string, unknown>);
      }
    } catch {
      // Malformed JSON-LD on the page — skip it.
    }
  }
  return objects;
}

function findJobPosting(objects: Record<string, unknown>[]): Record<string, unknown> | undefined {
  return objects.find((item) => {
    const type = item["@type"];
    return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
  });
}

function metaContent(html: string, property: string): string | undefined {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match) return match[1];
  }
  return undefined;
}

function extractIndustry(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : (v as { name?: string })?.name))
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .join(", ");
  }
  if (value && typeof value === "object" && typeof (value as { name?: string }).name === "string") {
    return (value as { name: string }).name;
  }
  return "";
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// JSON-LD JobPosting descriptions are typically HTML. Some sources (e.g.
// LinkedIn) double-encode it, so the tags themselves show up as literal
// "&lt;br&gt;" text — decode entities before stripping tags, not just after,
// or the tag regexes below never match and raw markup leaks into the text.
function htmlToText(html: string): string {
  return decodeHtmlEntities(
    decodeHtmlEntities(html)
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractJobPostingFromUrl(rawUrl: string): Promise<ExtractedJobPosting> {
  const empty = {
    companyName: "",
    companyWebsite: "",
    industry: "",
    roleTitle: "",
    roleDescription: "",
    source: "",
    jobUrl: rawUrl,
    interestLevel: 3,
  };

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ...empty, error: "That doesn't look like a valid URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ...empty, error: "Only http(s) URLs are supported." };
  }

  parsed = normalizeJobUrl(parsed);
  const source = inferSourceLabel(parsed.hostname);
  const knownSource = findJobSource(parsed.hostname);
  if (knownSource?.status === "blocked") {
    return {
      ...empty,
      source,
      error: knownSource.note ?? `${source} blocks automated requests. You can still fill this in by hand.`,
    };
  }

  let html: string;
  try {
    const res = await httpsGetFollowingRedirects(parsed.toString());
    if (isLoginWall(res.finalUrl)) {
      return {
        ...empty,
        source,
        error: "That link requires signing in to view. Try copying the link from the job's own page instead of a search-results page, or fill this in by hand.",
      };
    }
    if (res.status < 200 || res.status >= 300) {
      return {
        ...empty,
        source,
        error: `Couldn't fetch that page (HTTP ${res.status}). You can still fill this in by hand.`,
      };
    }
    html = res.body;
  } catch {
    return { ...empty, source, error: "Couldn't reach that URL. You can still fill this in by hand." };
  }

  const jsonLdObjects = extractJsonLdObjects(html);
  const jobPosting = findJobPosting(jsonLdObjects);

  let companyName = "";
  let companyWebsite = "";
  let industry = "";
  let roleTitle = "";
  let roleDescription = "";

  if (jobPosting) {
    if (typeof jobPosting.title === "string") roleTitle = jobPosting.title;
    const org = jobPosting.hiringOrganization as
      | { name?: string; url?: string; sameAs?: string }
      | string
      | undefined;
    if (typeof org === "string") {
      companyName = org;
    } else if (org) {
      if (typeof org.name === "string") companyName = org.name;
      if (typeof org.url === "string") companyWebsite = org.url;
      else if (typeof org.sameAs === "string") companyWebsite = org.sameAs;
    }
    if (typeof jobPosting.description === "string") {
      roleDescription = htmlToText(jobPosting.description);
    }
    industry = extractIndustry(jobPosting.industry);
  }

  const isLinkedIn = parsed.hostname.replace(/^www\./, "").endsWith("linkedin.com");
  let descriptionHandled = false;
  if (!jobPosting && isLinkedIn) {
    const ogTitle = metaContent(html, "og:title");
    if (ogTitle) {
      const parsedTitle = parseLinkedInTitle(ogTitle);
      if (!roleTitle) roleTitle = parsedTitle.roleTitle;
      if (!companyName) companyName = parsedTitle.companyName;
    }

    const richDescriptionHtml = extractLinkedInDescriptionHtml(html);
    if (richDescriptionHtml) {
      roleDescription = htmlToText(richDescriptionHtml);
      descriptionHandled = true;
    } else {
      const ogDescription = metaContent(html, "og:description");
      if (ogDescription) {
        // cleanLinkedInDescription can legitimately reduce pure boilerplate
        // to "" — that's a handled result, not "nothing found yet", so it
        // must not fall through to the raw og:description fallback below.
        roleDescription = cleanLinkedInDescription(ogDescription);
        descriptionHandled = true;
      }
    }
  }

  if (!roleTitle) {
    roleTitle = metaContent(html, "og:title") ?? "";
  }
  if (!roleDescription && !descriptionHandled) {
    roleDescription = metaContent(html, "og:description") ?? "";
  }

  const warning = !jobPosting
    ? "Couldn't find structured job data on that page — fields may be missing or wrong. Double-check before saving."
    : undefined;

  return {
    companyName: decodeHtmlEntities(companyName).trim(),
    companyWebsite: companyWebsite.trim(),
    industry: decodeHtmlEntities(industry).trim(),
    roleTitle: decodeHtmlEntities(roleTitle).trim(),
    roleDescription: decodeHtmlEntities(roleDescription).trim(),
    source,
    jobUrl: parsed.toString(),
    interestLevel: 3,
    warning,
  };
}
