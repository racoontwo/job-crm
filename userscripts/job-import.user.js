// ==UserScript==
// @name         Job CRM — Import job posting
// @namespace    job-crm
// @version      2.0
// @description  Reads the job posting you're viewing (as you, in your own browser) and sends it to your local Job CRM's review screen. Works on any job site; it's the only option for sites that block the app's own server (e.g. Glassdoor returns HTTP 403 to non-browser requests).
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @connect      127.0.0.1
// ==/UserScript==

(function () {
  "use strict";

  // Change this if your dev server runs on a different port.
  const APP_ORIGIN = "http://localhost:3000";

  // Mirrors lib/jobSources.ts's domain -> label map. Only used to label the
  // "Source" field nicely; unlisted hosts just use the bare hostname.
  const SOURCE_LABELS = [
    ["linkedin.com", "LinkedIn"],
    ["indeed.com", "Indeed"],
    ["glassdoor.com", "Glassdoor"],
    ["greenhouse.io", "Greenhouse"],
    ["lever.co", "Lever"],
    ["ashbyhq.com", "Ashby"],
    ["myworkdayjobs.com", "Workday"],
    ["workday.com", "Workday"],
    ["smartrecruiters.com", "SmartRecruiters"],
    ["breezy.hr", "Breezy"],
    ["wellfound.com", "Wellfound"],
    ["teamtailor.com", "Teamtailor"],
  ];

  function bareHost(hostname) {
    return hostname.replace(/^www\./, "");
  }

  function sourceLabel(hostname) {
    const host = bareHost(hostname);
    const match = SOURCE_LABELS.find(([domain]) => host === domain || host.endsWith(`.${domain}`));
    return match ? match[1] : host;
  }

  function metaContent(property) {
    const el =
      document.querySelector(`meta[property="${property}"]`) ||
      document.querySelector(`meta[name="${property}"]`);
    return el ? el.getAttribute("content") || "" : "";
  }

  function findJobPostingJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent || "");
        const items = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed["@graph"])
          ? parsed["@graph"]
          : [parsed];
        const jobPosting = items.find((item) => {
          const type = item && item["@type"];
          return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
        });
        if (jobPosting) return jobPosting;
      } catch {
        // Malformed JSON-LD on the page — skip it.
      }
    }
    return null;
  }

  function htmlToText(html) {
    return html
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // Heuristic for "does this page look like a job posting" — only decides
  // whether to show the floating button, so it doesn't clutter every site
  // you visit. Extraction itself doesn't depend on this passing.
  function looksLikeJobPosting() {
    if (findJobPostingJsonLd()) return true;
    const host = bareHost(window.location.hostname);
    if (SOURCE_LABELS.some(([domain]) => host === domain || host.endsWith(`.${domain}`))) return true;
    return /\/(jobs?|careers?|positions?|vacanc(y|ies))(\/|$)/i.test(window.location.pathname);
  }

  // A handful of sites format og:title in ways worth untangling into
  // separate role/company fields when JSON-LD isn't present. These two are
  // verified against real listings (see job-crm's lib/jobPosting.ts for the
  // server-side equivalents); unlisted sites just get the raw og:title with
  // no company guess — better an empty field you fill in than a wrong guess.
  function parseTitleFallback(hostname, rawTitle) {
    const host = bareHost(hostname);

    if (host.endsWith("linkedin.com")) {
      const title = rawTitle.replace(/\s*\|\s*LinkedIn(?:\s*Jobs)?\s*$/i, "").trim();
      let m = title.match(/^(.+?) hiring (.+?) in .+$/i);
      if (m) return { roleTitle: m[2].trim(), companyName: m[1].trim() };
      m = title.match(/^(.+?) at (.+)$/i);
      if (m) return { roleTitle: m[1].trim(), companyName: m[2].split(/\s*[—–]\s*/)[0].trim() };
      return { roleTitle: title, companyName: "" };
    }

    if (host.endsWith("glassdoor.com")) {
      const title = rawTitle.replace(/\s*\|\s*Glassdoor\s*$/i, "").trim();
      const m = title.match(/^(.+?) at (.+)$/i);
      if (m) return { roleTitle: m[1].trim(), companyName: m[2].trim() };
      return { roleTitle: title, companyName: "" };
    }

    return { roleTitle: rawTitle.trim(), companyName: "" };
  }

  function extractJobData() {
    const jobPosting = findJobPostingJsonLd();

    let companyName = "";
    let roleTitle = "";
    let roleDescription = "";

    if (jobPosting) {
      if (typeof jobPosting.title === "string") roleTitle = jobPosting.title;
      const org = jobPosting.hiringOrganization;
      if (typeof org === "string") companyName = org;
      else if (org && typeof org.name === "string") companyName = org.name;
      if (typeof jobPosting.description === "string") {
        roleDescription = htmlToText(jobPosting.description);
      }
    }

    if (!roleTitle || !companyName) {
      const ogTitle = metaContent("og:title") || document.title;
      if (ogTitle) {
        const parsed = parseTitleFallback(window.location.hostname, ogTitle);
        if (!roleTitle) roleTitle = parsed.roleTitle;
        if (!companyName) companyName = parsed.companyName;
      }
    }

    if (!roleDescription) {
      roleDescription = metaContent("og:description") || "";
    }

    return {
      companyName,
      roleTitle,
      roleDescription,
      source: sourceLabel(window.location.hostname),
      jobUrl: window.location.href,
    };
  }

  function sendToJobCrm(data) {
    GM_xmlhttpRequest({
      method: "POST",
      url: `${APP_ORIGIN}/api/import-job`,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify(data),
      onload(response) {
        if (response.status < 200 || response.status >= 300) {
          setStatus(`Job CRM import failed (HTTP ${response.status}). Is the app running?`, true);
          return;
        }
        try {
          const { reviewUrl } = JSON.parse(response.responseText);
          window.open(reviewUrl, "_blank");
          setStatus("Sent — review tab opened.", false);
        } catch {
          setStatus("Job CRM import failed — unexpected response.", true);
        }
      },
      onerror() {
        setStatus(`Couldn't reach ${APP_ORIGIN}. Is the app running?`, true);
      },
    });
  }

  let statusEl;
  function setStatus(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.style.color = isError ? "#dc2626" : "#16a34a";
  }

  function addButton() {
    if (document.getElementById("job-crm-import-btn")) return;

    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed;bottom:16px;right:16px;z-index:999999;display:flex;flex-direction:column;align-items:flex-end;gap:4px;font-family:sans-serif;";

    const button = document.createElement("button");
    button.id = "job-crm-import-btn";
    button.textContent = `Send to Job CRM (${sourceLabel(window.location.hostname)})`;
    button.style.cssText =
      "padding:10px 16px;background:#171717;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);";
    button.onclick = () => {
      setStatus("Sending…", false);
      sendToJobCrm(extractJobData());
    };

    statusEl = document.createElement("span");
    statusEl.style.cssText =
      "font-size:11px;background:#fff;padding:2px 6px;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,0.15);";

    container.appendChild(statusEl);
    container.appendChild(button);
    document.body.appendChild(container);
  }

  function maybeAddButton() {
    if (looksLikeJobPosting()) addButton();
  }

  maybeAddButton();
  // Many job sites are single-page apps where the URL/content changes
  // without a full reload — recheck as the DOM changes.
  new MutationObserver(maybeAddButton).observe(document.body, { childList: true, subtree: true });
})();
