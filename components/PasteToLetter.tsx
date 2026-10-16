"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { writeLetterFromPaste, type PasteResult } from "@/lib/actions/actions";
import { POSTING_KIND_LABELS, guessKindFromText, type PostingKind } from "@/lib/postingKind";

// The main page: paste a posting, get a letter. The kind is guessed from the
// paste (a link to Upwork, "Fixed-price", …) and can be overridden; the
// server action saves the job and queues the letter, then opens it.
export default function PasteToLetter() {
  const [state, formAction, isPending] = useActionState<PasteResult, FormData>(
    writeLetterFromPaste,
    {}
  );
  const [posting, setPosting] = useState("");
  const [override, setOverride] = useState<PostingKind | null>(null);
  const guessed = guessKindFromText(posting);
  const kind = override ?? guessed;

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Write a cover letter</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Paste a job posting — the whole text, or just the link if the site lets the app read it.
          It&apos;s saved as &ldquo;To apply&rdquo; and the letter is written straight away.
        </p>
      </div>

      <textarea
        name="posting"
        value={posting}
        onChange={(e) => setPosting(e.target.value)}
        required
        autoFocus
        rows={14}
        disabled={isPending}
        placeholder="Paste the job posting here…"
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm disabled:opacity-60"
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <fieldset className="flex items-center gap-2 text-sm">
          <legend className="sr-only">Kind of posting</legend>
          <input type="hidden" name="kind" value={override ?? "auto"} />
          {(["job", "freelance"] as const).map((k) => (
            <button
              key={k}
              type="button"
              disabled={isPending}
              onClick={() => setOverride(k === guessed ? null : k)}
              className={`rounded-md border px-3 py-1.5 text-left ${
                kind === k
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"
              }`}
            >
              <span className="font-medium">{POSTING_KIND_LABELS[k].name}</span>
              <span className={kind === k ? "text-neutral-300" : "text-neutral-500"}>
                {" "}
                · {POSTING_KIND_LABELS[k].letter}
              </span>
            </button>
          ))}
          {posting.trim() && (
            <span className="text-xs text-neutral-500">{override ? "chosen" : "detected"}</span>
          )}
        </fieldset>

        <div className="ml-auto flex items-center gap-2">
          <select
            name="provider"
            defaultValue="claude"
            disabled={isPending}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="claude">Claude (local CLI)</option>
            <option value="gemini">Gemini</option>
          </select>
          <button
            type="submit"
            disabled={isPending || !posting.trim()}
            className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {isPending ? "Reading the posting…" : "Write cover letter"}
          </button>
        </div>
      </div>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
          {state.existing && (
            <>
              {" "}
              <Link href={`/applications/${state.existing.id}#cover-letter`} className="font-medium underline">
                Open {state.existing.label}
              </Link>
            </>
          )}
        </p>
      )}

      <p className="text-xs text-neutral-500">
        Need to check the details first?{" "}
        <Link href="/applications/new" className="underline">
          Add it step by step
        </Link>{" "}
        instead.
      </p>
    </form>
  );
}
