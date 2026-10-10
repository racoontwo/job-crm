"use client";

import { useRef, useState, useTransition } from "react";
import { deleteProfileFileAction, uploadProfileFileAction } from "@/lib/actions/actions";
import type { ProfileFileInfo } from "@/lib/profileStore";

const ACCEPT = ".pdf,.docx,.md,.txt";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileStatus(file: ProfileFileInfo): { text: string; className: string } {
  if (file.error) return { text: file.error, className: "text-red-600" };
  if (file.template) return { text: "unfilled template — not used", className: "text-amber-700" };
  if (file.words === 0) {
    return { text: "no readable text (scanned?) — not used", className: "text-amber-700" };
  }
  return { text: `${file.words.toLocaleString("en-GB")} words`, className: "text-neutral-600" };
}

// One section of the profile on the Settings page: drop files (or click to
// pick them) and they're saved into that section's profile/ folder, one
// upload per file.
export default function ProfileDropZone({
  section,
  title,
  folder,
  description,
  files,
}: {
  section: "about" | "style" | "examples";
  title: string;
  folder: string;
  description: string;
  files: ProfileFileInfo[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    const picked = Array.from(list);
    setErrors([]);
    startTransition(async () => {
      const problems: string[] = [];
      for (const file of picked) {
        const formData = new FormData();
        formData.set("section", section);
        formData.set("file", file);
        try {
          const result = await uploadProfileFileAction(formData);
          if (result.error) problems.push(result.error);
        } catch {
          problems.push(`"${file.name}" couldn't be uploaded (over 10 MB?).`);
        }
      }
      setErrors(problems);
    });
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-600">{title}</h2>
      <p className="mb-3 mt-1 text-xs text-neutral-600">
        <code>{folder}</code> — {description}
      </p>

      {files.length > 0 && (
        <ul className="mb-3 divide-y divide-neutral-100">
          {files.map((file) => {
            const status = fileStatus(file);
            return (
              <li key={file.filename} className="flex items-center justify-between gap-4 py-2 text-sm">
                <span className="truncate text-neutral-900">{file.filename}</span>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <span className={status.className}>{status.text}</span>
                  <span className="text-neutral-600">{formatBytes(file.size)}</span>
                  <form action={deleteProfileFileAction}>
                    <input type="hidden" name="section" value={section} />
                    <input type="hidden" name="filename" value={file.filename} />
                    <button type="submit" className="font-medium text-red-600 hover:underline">
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
        disabled={isPending}
        className={`flex w-full flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-8 text-sm transition-colors ${
          dragging
            ? "border-neutral-900 bg-neutral-50 text-neutral-900"
            : "border-neutral-300 text-neutral-700 hover:border-neutral-400"
        } disabled:opacity-60`}
      >
        <span className="font-medium">
          {isPending ? "Uploading…" : "Drop files here, or click to choose"}
        </span>
        <span className="mt-1 text-xs text-neutral-600">PDF, Word (.docx), .md or .txt — up to 10 MB each</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          upload(e.target.files);
          e.target.value = "";
        }}
      />

      {errors.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-red-600">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
