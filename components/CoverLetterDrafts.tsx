"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { applyCoverLetterDraft } from "@/lib/actions/actions";
import type { CoverLetterDraft } from "@/lib/db/coverLetterDrafts";

const POLL_MS = 3000;

const STATUS_STYLES: Record<CoverLetterDraft["status"], string> = {
  queued: "bg-neutral-100 text-neutral-600",
  generating: "bg-amber-100 text-amber-800",
  ready: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-700",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function duration(draft: CoverLetterDraft) {
  if (!draft.startedAt || !draft.finishedAt) return null;
  const seconds = Math.round(
    (new Date(draft.finishedAt).getTime() - new Date(draft.startedAt).getTime()) / 1000
  );
  return `${seconds}s`;
}

// Generation history for one application. While a draft is queued or
// generating, re-fetches the page every few seconds to pick up its progress.
export default function CoverLetterDrafts({
  drafts,
  currentLetter,
}: {
  drafts: CoverLetterDraft[];
  currentLetter: string | null;
}) {
  const router = useRouter();
  const active = drafts.some((d) => d.status === "queued" || d.status === "generating");

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [active, router]);

  if (drafts.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        Drafts ({drafts.length})
      </h3>
      <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
        {drafts.map((draft) => {
          const inUse = draft.letter !== null && draft.letter === currentLetter;
          return (
            <li key={draft.id} className="p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[draft.status]}`}
                >
                  {draft.status}
                </span>
                <span className="text-neutral-600">{draft.model ?? draft.provider}</span>
                <span className="text-xs text-neutral-400">
                  {formatTime(draft.createdAt)}
                  {duration(draft) && ` · ${duration(draft)}`}
                  {draft.exampleCount !== null && ` · ${draft.exampleCount} example letters`}
                </span>
                {draft.status === "ready" &&
                  (inUse ? (
                    <span className="ml-auto text-xs text-neutral-500">In use</span>
                  ) : (
                    <form action={applyCoverLetterDraft} className="ml-auto">
                      <input type="hidden" name="draftId" value={draft.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50"
                      >
                        Use this version
                      </button>
                    </form>
                  ))}
              </div>
              {draft.error && <p className="mt-2 text-xs text-red-600">{draft.error}</p>}
              {draft.letter && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-neutral-500">Show letter</summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{draft.letter}</p>
                </details>
              )}
              {draft.prompt && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-neutral-500">
                    Show what was sent to the AI
                  </summary>
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-neutral-50 p-2 text-[11px] text-neutral-600">
                    {draft.prompt}
                  </pre>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
