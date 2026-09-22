"use client";

import { useState, useTransition } from "react";
import { createCompanyAndApplication, extractJobPosting } from "@/lib/actions/actions";
import type { ExtractedJobPosting } from "@/lib/jobPosting";

const inputClass =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";

export default function NewApplicationFlow({
  existingCompanies,
}: {
  existingCompanies: { id: number; name: string }[];
}) {
  const [url, setUrl] = useState("");
  const [extracted, setExtracted] = useState<ExtractedJobPosting | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleExtract() {
    setFetchError(null);
    startTransition(async () => {
      const result = await extractJobPosting(url);
      if (result.error) {
        setFetchError(result.error);
        return;
      }
      setExtracted(result);
    });
  }

  if (!extracted) {
    return (
      <div className="mx-auto max-w-lg">
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
        {fetchError && <p className="mt-2 text-sm text-red-600">{fetchError}</p>}
        <button
          type="button"
          disabled={!url || isPending}
          onClick={handleExtract}
          className="mt-4 w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {isPending ? "Reading posting..." : "Fetch details"}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-2 text-xl font-semibold">Review & confirm</h1>
      <p className="mb-4 truncate text-xs text-neutral-400">{extracted.jobUrl}</p>
      {extracted.warning && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {extracted.warning}
        </p>
      )}
      <form action={createCompanyAndApplication} className="space-y-4">
        <input type="hidden" name="jobUrl" value={extracted.jobUrl} />

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
          Applied date is stamped automatically the moment you hit Save application.
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
