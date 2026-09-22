// Parses a job posting page for structured data, without any AI/LLM call.
// Primary source: schema.org JobPosting JSON-LD, which most job boards and
// ATS platforms (LinkedIn, Indeed, Greenhouse, Lever, Ashby, ...) embed for
// SEO. Falls back to OpenGraph tags when that's absent.

import http from "node:http";
import https from "node:https";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// Next.js/undici's fetch tries IPv6 first and hangs/times out against hosts
// this machine has no IPv6 route to (even though curl and browsers work
// fine over IPv4). Using node:https directly with family: 4 sidesteps it.
function httpsGetFollowingRedirects(
  targetUrl: string,
  maxRedirects = 5
): Promise<{ status: number; body: string }> {
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
        res.on("end", () => resolve({ status: statusCode, body: data }));
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

const SOURCE_MAP: Record<string, string> = {
  "linkedin.com": "LinkedIn",
  "indeed.com": "Indeed",
  "glassdoor.com": "Glassdoor",
  "greenhouse.io": "Greenhouse",
  "lever.co": "Lever",
  "ashbyhq.com": "Ashby",
  "workday.com": "Workday",
  "myworkdayjobs.com": "Workday",
  "smartrecruiters.com": "SmartRecruiters",
  "breezy.hr": "Breezy",
  "wellfound.com": "Wellfound",
  "teamtailor.com": "Teamtailor",
};

export type ExtractedJobPosting = {
  companyName: string;
  roleTitle: string;
  roleDescription: string;
  source: string;
  jobUrl: string;
  interestLevel: number;
  warning?: string;
  error?: string;
};

function inferSource(hostname: string): string {
  const host = hostname.replace(/^www\./, "");
  for (const [domain, label] of Object.entries(SOURCE_MAP)) {
    if (host === domain || host.endsWith(`.${domain}`)) return label;
  }
  return host;
}

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

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// JSON-LD JobPosting descriptions are typically HTML. Convert block-level
// tags to line breaks before stripping, so the plain text stays readable.
function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
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

  const source = inferSource(parsed.hostname);
  let html: string;
  try {
    const res = await httpsGetFollowingRedirects(parsed.toString());
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
  let roleTitle = "";
  let roleDescription = "";

  if (jobPosting) {
    if (typeof jobPosting.title === "string") roleTitle = jobPosting.title;
    const org = jobPosting.hiringOrganization as { name?: string } | string | undefined;
    if (typeof org === "string") companyName = org;
    else if (org && typeof org.name === "string") companyName = org.name;
    if (typeof jobPosting.description === "string") {
      roleDescription = htmlToText(jobPosting.description);
    }
  }

  if (!roleTitle) {
    roleTitle = metaContent(html, "og:title") ?? "";
  }
  if (!roleDescription) {
    roleDescription = metaContent(html, "og:description") ?? "";
  }

  const warning = !jobPosting
    ? "Couldn't find structured job data on that page — fields may be missing or wrong. Double-check before saving."
    : undefined;

  return {
    companyName: decodeHtmlEntities(companyName).trim(),
    roleTitle: decodeHtmlEntities(roleTitle).trim(),
    roleDescription: decodeHtmlEntities(roleDescription).trim(),
    source,
    jobUrl: parsed.toString(),
    interestLevel: 3,
    warning,
  };
}
