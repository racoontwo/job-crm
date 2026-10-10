"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createCompanyAndApplication, extractJobPosting } from "@/lib/actions/actions";
import type { ExtractedJobPosting } from "@/lib/jobPosting";
import { findJobSource, inferSourceLabel } from "@/lib/jobSources";
import type { SavedLinkSummary } from "@/lib/db/types";
import FlowSteps from "@/components/FlowSteps";
import { jobUrlKey } from "@/lib/jobUrl";

type ExistingJob = { key: string; id: string; label: string; status: string };

const inputClass =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";

const DETECTED_BADGE_COLORS: Record<string, string> = {
  working: "bg-green-100 text-green-800",
  blocked: "bg-red-100 text-red-800",
  unverified: "bg-neutral-200 text-neutral-600",
  unknown: "bg-neutral-100 text-neutral-500",
};

function useDetectedSource(url: string) {
  return useMemo(() => {
    if (!url.trim()) return null;
    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return null;
    }
    const known = findJobSource(hostname);
    return {
      label: inferSourceLabel(hostname),
      status: known?.status ?? "unknown",
      note: known?.note,
    };
  }, [url]);
}

export default function NewApplicationFlow({
  existingCompanies,
  existingJobs = [],
  initialExtracted = null,
  savedLink = null,
}: {
  existingCompanies: { id: string; name: string }[];
  existingJobs?: ExistingJob[];
  initialExtracted?: ExtractedJobPosting | null;
  savedLink?: SavedLinkSummary | null;
}) {
  const [url, setUrl] = useState(initialExtracted?.jobUrl ?? savedLink?.url ?? "");
  const [extracted, setExtracted] = useState<ExtractedJobPosting | null>(initialExtracted);
  // A failed fetch still carries the cleaned link and guesses from it, which
  // "Fill in by hand" starts the form from.
  const [failed, setFailed] = useState<ExtractedJobPosting | null>(null);
  const [isPending, startTransition] = useTransition();
  const detectedSource = useDetectedSource(url);

  function handleExtract() {
    setFailed(null);
    startTransition(async () => {
      const result = await extractJobPosting(url);
      if (result.error) {
        setFailed(result);
        return;
      }
      setExtracted(result);
    });
  }

  function fillInByHand() {
    const base = failed ?? {
      companyName: "",
      companyWebsite: "",
      industry: "",
      roleTitle: "",
      roleDescription: "",
      source: "",
      jobUrl: url,
      interestLevel: 3,
    };
    // Text shared along with the link from the phone is usually the title.
    const sharedTitle = savedLink?.sharedText?.trim();
    setExtracted({
      ...base,
      roleTitle: base.roleTitle || (sharedTitle && sharedTitle.length <= 120 ? sharedTitle : ""),
      error: undefined,
      warning:
        "Couldn't read the page, so fill in what's missing. Copy the job description from the posting into Role details — the cover letter is written from it.",
    });
  }

  // Coming from the inbox, the link is already saved (step 1) — go straight
  // to fetching it. The ref keeps dev-mode's double effect run from fetching twice.
  const autoFetched = useRef(false);
  useEffect(() => {
    if (savedLink && !initialExtracted && !autoFetched.current) {
      autoFetched.current = true;
      handleExtract();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!extracted) {
    return (
      <div className="mx-auto max-w-lg">
        <FlowSteps current={2} />
        <h1 className="mb-6 text-xl font-semibold">New application</h1>
        <label className="mb-1 block text-sm font-medium">Job posting URL</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          autoFocus
          className={inputClass}
          placeholder="https://..."
        />
        {detectedSource && (
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                DETECTED_BADGE_COLORS[detectedSource.status]
              }`}
            >
              Detected: {detectedSource.label}
            </span>
            {detectedSource.status === "blocked" && !failed && (
              <span className="text-xs text-red-600">{detectedSource.note}</span>
            )}
            {detectedSource.status === "unknown" && (
              <span className="text-xs text-neutral-400">
                Not a known job board — will try generic parsing.
              </span>
            )}
          </div>
        )}
        {failed?.error && <p className="mt-2 text-sm text-red-600">{failed.error}</p>}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            disabled={!url || isPending}
            onClick={handleExtract}
            className={`w-full rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${
              failed
                ? "border border-neutral-300 hover:bg-neutral-50"
                : "bg-neutral-900 text-white hover:bg-neutral-700"
            }`}
          >
            {isPending ? "Reading posting..." : failed ? "Try again" : "Fetch details"}
          </button>
          {failed && (
            <button
              type="button"
              onClick={fillInByHand}
              className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Fill in by hand
            </button>
          )}
        </div>
      </div>
    );
  }

  const missingFields = [
    !extracted.companyName.trim() && "company name",
    !extracted.roleTitle.trim() && "role title",
    !extracted.roleDescription.trim() && "role details",
  ].filter((f): f is string => Boolean(f));
  const extractionSucceeded = missingFields.length === 0;
  const duplicateOf = existingJobs.find((j) => j.key === jobUrlKey(extracted.jobUrl));

  return (
    <div className="mx-auto max-w-lg">
      <FlowSteps current={2} />
      <h1 className="mb-2 text-xl font-semibold">Review & confirm</h1>
      <p className="mb-4 truncate text-xs text-neutral-400">{extracted.jobUrl}</p>
      <div
        className={`mb-4 flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
          extractionSucceeded ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
        }`}
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            extractionSucceeded ? "bg-green-500" : "bg-red-500"
          }`}
        />
        {extractionSucceeded
          ? "Extraction successful — company, role, and description were all found."
          : `Extraction incomplete — couldn't find: ${missingFields.join(", ")}.`}
      </div>
      {duplicateOf && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          You already have this job:{" "}
          <a href={`/applications/${duplicateOf.id}`} className="font-medium underline">
            {duplicateOf.label}
          </a>{" "}
          ({duplicateOf.status}). Saving again creates a second application.
        </p>
      )}
      {extracted.warning && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {extracted.warning}
        </p>
      )}
      <form action={createCompanyAndApplication} className="space-y-4">
        <input type="hidden" name="jobUrl" value={extracted.jobUrl} />
        {savedLink && <input type="hidden" name="savedLinkId" value={savedLink.id} />}

        <div>
          <label className="mb-1 block text-sm font-medium">Company name</label>
          <input
            name="companyName"
            list="company-list"
            required
            defaultValue={extracted.companyName}
            className={inputClass}
            placeholder="e.g. Acme Corp"
          />
          <datalist id="company-list">
            {existingCompanies.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          <p className="mt-1 text-xs text-neutral-400">
            Type an existing name to reuse that company, or a new one to create it.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Company website</label>
            <input
              name="website"
              type="url"
              defaultValue={extracted.companyWebsite}
              className={inputClass}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Industry</label>
            <input
              name="industry"
              defaultValue={extracted.industry}
              className={inputClass}
              placeholder="e.g. Software"
            />
          </div>
        </div>
        <p className="-mt-2 text-xs text-neutral-400">
          Only used the first time you add this company.
        </p>

        <div>
          <label className="mb-1 block text-sm font-medium">Role title</label>
          <input
            name="roleTitle"
            required
            defaultValue={extracted.roleTitle}
            className={inputClass}
            placeholder="e.g. Full Stack Developer"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Source</label>
          <input
            name="source"
            defaultValue={extracted.source}
            className={inputClass}
            placeholder="LinkedIn, referral, direct..."
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Role details</label>
          <textarea
            name="roleDescription"
            defaultValue={extracted.roleDescription}
            rows={8}
            className={`${inputClass} font-mono text-xs`}
            placeholder="Job description, requirements, etc."
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            How interested are you? (company-level rating)
          </label>
          <select name="interestLevel" defaultValue={extracted.interestLevel} className={inputClass}>
            <option value={1}>★☆☆☆☆ — low priority</option>
            <option value={2}>★★☆☆☆</option>
            <option value={3}>★★★☆☆ — decent fit</option>
            <option value={4}>★★★★☆</option>
            <option value={5}>★★★★★ — dream company</option>
          </select>
          <p className="mt-1 text-xs text-neutral-400">
            Can&apos;t be read off the posting — set it yourself. Only used the first time you
            add this company.
          </p>
        </div>

        <p className="text-xs text-neutral-400">
          Saved as &ldquo;To apply&rdquo; &mdash; you&apos;ll mark it applied after writing the cover
          letter, which records the applied date.
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setExtracted(null)}
            className="w-full rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Back
          </button>
          <button
            type="submit"
            className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Save application
          </button>
        </div>
      </form>
    </div>
  );
}
