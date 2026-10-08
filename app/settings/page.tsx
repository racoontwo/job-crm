import {
  getProfileSettings,
  saveResumeAction,
  saveWritingStyleAction,
  uploadNotesAction,
  deleteNoteAction,
  uploadExamplesAction,
  deleteExampleAction,
} from "@/lib/actions/actions";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const textareaClass =
  "w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs";
const saveButtonClass =
  "rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700";
const uploadButtonClass =
  "rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50";

export default async function SettingsPage() {
  const { resume, writingStyle, notes, examples } = await getProfileSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500">
          The documents the cover-letter generator reads: your background, writing rules,
          extra notes, and past letters. Stored locally in <code>profile/</code> — gitignored,
          never leaves this machine.
        </p>
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Resume
        </h2>
        <p className="mb-3 mt-1 text-xs text-neutral-400">
          profile/resume.md — your background. The generator may only use facts that appear
          here.
        </p>
        <form action={saveResumeAction} className="space-y-2">
          <textarea name="content" rows={16} defaultValue={resume} className={textareaClass} />
          <button type="submit" className={saveButtonClass}>
            Save
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Writing style
        </h2>
        <p className="mb-3 mt-1 text-xs text-neutral-400">
          profile/writing-style.md — hard rules: language, tone, length, structure, banned
          phrases, signature.
        </p>
        <form action={saveWritingStyleAction} className="space-y-2">
          <textarea
            name="content"
            rows={10}
            defaultValue={writingStyle}
            className={textareaClass}
          />
          <button type="submit" className={saveButtonClass}>
            Save
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Notes
        </h2>
        <p className="mb-3 mt-1 text-xs text-neutral-400">
          profile/notes/*.md — extra background, optional. Every file here is combined into the
          resume.
        </p>
        <ul className="mb-4 divide-y divide-neutral-100">
          {notes.length === 0 && (
            <li className="py-2 text-sm text-neutral-400">No notes yet.</li>
          )}
          {notes.map((note) => (
            <li key={note.filename} className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="truncate">{note.filename}</span>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-neutral-400">{formatBytes(note.size)}</span>
                <form action={deleteNoteAction}>
                  <input type="hidden" name="filename" value={note.filename} />
                  <button type="submit" className="text-xs font-medium text-red-600 hover:underline">
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
        <form action={uploadNotesAction} className="flex items-center gap-2">
          <input type="file" name="files" accept=".md" multiple className="text-sm" />
          <button type="submit" className={uploadButtonClass}>
            Upload
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Example cover letters
        </h2>
        <p className="mb-3 mt-1 text-xs text-neutral-400">
          profile/examples/*.md or .txt — past letters you&apos;ve written, optional (up to 6
          used). Combined with letters you save through this app.
        </p>
        <ul className="mb-4 divide-y divide-neutral-100">
          {examples.length === 0 && (
            <li className="py-2 text-sm text-neutral-400">No examples yet.</li>
          )}
          {examples.map((example) => (
            <li
              key={example.filename}
              className="flex items-center justify-between gap-4 py-2 text-sm"
            >
              <span className="truncate">{example.filename}</span>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-neutral-400">{formatBytes(example.size)}</span>
                <form action={deleteExampleAction}>
                  <input type="hidden" name="filename" value={example.filename} />
                  <button type="submit" className="text-xs font-medium text-red-600 hover:underline">
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
        <form action={uploadExamplesAction} className="flex items-center gap-2">
          <input type="file" name="files" accept=".md,.txt" multiple className="text-sm" />
          <button type="submit" className={uploadButtonClass}>
            Upload
          </button>
        </form>
      </section>
    </div>
  );
}
