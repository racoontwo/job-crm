"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateCoverLetter } from "@/lib/actions/actions";

type Provider = "gemini" | "claude";

// Queues a draft; the drafts list below (CoverLetterDrafts) shows its
// progress. Nothing is overwritten, so no confirmation is needed.
export default function GenerateCoverLetterButton({
  applicationId,
  hasDrafts,
  busy,
}: {
  applicationId: string;
  hasDrafts: boolean;
  busy: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>("claude");
  const disabled = isPending || busy;

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        await generateCoverLetter(applicationId, provider);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as Provider)}
          disabled={disabled}
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm disabled:opacity-50"
        >
          <option value="claude">Claude (local CLI)</option>
          <option value="gemini">Gemini</option>
        </select>
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {busy ? "Generating…" : hasDrafts ? "Generate another draft" : "Generate cover letter"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
