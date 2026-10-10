import { notFound } from "next/navigation";
import {
  getApplication,
  addStatusEvent,
  addFollowUp,
} from "@/lib/actions/actions";
import { STATUS_STAGES } from "@/lib/db/schema";
import { toggleFollowUpDone } from "@/lib/actions/actions";
import DeleteApplicationButton from "@/components/DeleteApplicationButton";
import GenerateCoverLetterButton from "@/components/GenerateCoverLetterButton";
import CoverLetterDrafts from "@/components/CoverLetterDrafts";
import { listCoverLetterDrafts } from "@/lib/actions/actions";
import { saveCoverLetter } from "@/lib/actions/actions";
import FlowSteps from "@/components/FlowSteps";

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { id } = await params;
  const { step } = await searchParams;
  const isCoverLetterStep = step === "cover-letter";
  const app = await getApplication(id);
  if (!app) notFound();
  const drafts = await listCoverLetterDrafts(app.id);
  const generating = drafts.some((d) => d.status === "queued" || d.status === "generating");

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      {isCoverLetterStep && (
        <div className="-mb-4">
          <FlowSteps current={3} />
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{app.company.name}</h1>
          <p className="text-neutral-600">{app.roleTitle}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-neutral-500">
            <span>{app.appliedDate ? `Applied ${app.appliedDate}` : "Not applied yet"}</span>
            <span>{"★".repeat(app.company.interestLevel)}{"☆".repeat(5 - app.company.interestLevel)}</span>
            {app.company.industry && <span>{app.company.industry}</span>}
            {app.source && <span>via {app.source}</span>}
            {app.company.website && (
              <a
                href={app.company.website}
                target="_blank"
                className="text-blue-600 hover:underline"
              >
                company site ↗
              </a>
            )}
            {app.jobUrl && (
              <a
                href={app.jobUrl}
                target="_blank"
                className="text-blue-600 hover:underline"
              >
                job posting ↗
              </a>
            )}
          </div>
        </div>
        <DeleteApplicationButton applicationId={app.id} />
      </div>

      {app.roleDescription && (
        <section className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Role details
          </h2>
          <p className="whitespace-pre-wrap text-sm text-neutral-700">{app.roleDescription}</p>
        </section>
      )}

      <section
        id="cover-letter"
        className={`scroll-mt-4 rounded-lg border bg-white p-5 ${
          isCoverLetterStep ? "border-neutral-900" : "border-neutral-200"
        }`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Cover letter
          </h2>
          <GenerateCoverLetterButton
            applicationId={app.id}
            hasDrafts={drafts.length > 0}
            busy={generating}
          />
        </div>

        {!app.coverLetter && (
          <p className="mb-4 text-sm text-neutral-500">
            {generating
              ? "Writing your draft — it lands here when it's ready. You can leave this page."
              : "No cover letter yet — generate a draft, then edit it below before saving."}
          </p>
        )}

        {/* Keyed on the saved letter so a draft filling it in (or "Use this
            version") shows up — the textarea is uncontrolled. */}
        <form key={app.coverLetter ?? ""} action={saveCoverLetter} className="space-y-2">
          <input type="hidden" name="applicationId" value={app.id} />
          <textarea
            name="coverLetter"
            rows={14}
            defaultValue={app.coverLetter ?? ""}
            placeholder="Your cover letter — generated drafts land here and can be edited before saving."
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-neutral-500">
              Edits you save here also shape future drafts.
            </p>
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Save cover letter
            </button>
          </div>
        </form>

        <CoverLetterDrafts drafts={drafts} currentLetter={app.coverLetter} />
      </section>

      {app.currentStatus === "To apply" && (
        <section className="rounded-lg border border-sky-200 bg-sky-50 p-5">
          <form action={addStatusEvent} className="flex flex-wrap items-end justify-between gap-4">
            <input type="hidden" name="applicationId" value={app.id} />
            <input type="hidden" name="status" value="Applied" />
            <div>
              <h2 className="text-sm font-semibold text-sky-900">Sent it?</h2>
              <p className="mt-1 text-sm text-sky-800">
                Once you&apos;ve submitted the application, mark it applied to record the date.
              </p>
            </div>
            <div className="flex items-end gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-sky-900">Applied on</label>
                <input
                  type="date"
                  name="eventDate"
                  defaultValue={today}
                  max={today}
                  className="rounded-md border border-sky-300 bg-white px-2 py-1.5 text-sm"
                />
              </div>
              <button
                type="submit"
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
              >
                Mark as applied
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Status timeline
        </h2>
        <ol className="mb-6 space-y-3 border-l-2 border-neutral-200 pl-4">
          {app.statusEvents.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-neutral-900" />
              <div className="flex items-baseline gap-2">
                <span className="font-medium">{e.status}</span>
                <span className="text-xs text-neutral-500">{e.eventDate}</span>
              </div>
              {e.note && <p className="text-sm text-neutral-600">{e.note}</p>}
            </li>
          ))}
        </ol>

        <form action={addStatusEvent} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="applicationId" value={app.id} />
          <div>
            <label className="mb-1 block text-xs font-medium">Status</label>
            <select
              name="status"
              defaultValue="Screening"
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            >
              {STATUS_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Date</label>
            <input
              type="date"
              name="eventDate"
              defaultValue={today}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-xs font-medium">Note</label>
            <input
              name="note"
              placeholder="e.g. 1st round - tech interview"
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Add update
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Follow-ups
        </h2>
        <ul className="mb-6 space-y-2">
          {app.followUps.length === 0 && (
            <p className="text-sm text-neutral-500">No follow-ups set.</p>
          )}
          {app.followUps.map((f) => (
            <li key={f.id} className="flex items-center gap-3 text-sm">
              <form
                action={async () => {
                  "use server";
                  await toggleFollowUpDone(f.id, app.id, !f.done);
                }}
              >
                <button
                  type="submit"
                  className={`h-4 w-4 rounded border ${
                    f.done ? "border-green-600 bg-green-600" : "border-neutral-300"
                  }`}
                  aria-label="Toggle done"
                />
              </form>
              <span className={f.done ? "text-neutral-500 line-through" : ""}>
                {f.dueDate} — {f.note || "Follow up"}
              </span>
            </li>
          ))}
        </ul>

        <form action={addFollowUp} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="applicationId" value={app.id} />
          <div>
            <label className="mb-1 block text-xs font-medium">Due date</label>
            <input
              type="date"
              name="dueDate"
              defaultValue={today}
              className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-xs font-medium">Note</label>
            <input
              name="note"
              placeholder="e.g. Ping if no reply"
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Add follow-up
          </button>
        </form>
      </section>
    </div>
  );
}
