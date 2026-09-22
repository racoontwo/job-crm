import { notFound } from "next/navigation";
import {
  getApplication,
  addStatusEvent,
  addFollowUp,
} from "@/lib/actions/actions";
import { STATUS_STAGES } from "@/lib/db/schema";
import { toggleFollowUpDone } from "@/lib/actions/actions";
import DeleteApplicationButton from "@/components/DeleteApplicationButton";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const app = await getApplication(Number(id));
  if (!app) notFound();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{app.company.name}</h1>
          <p className="text-neutral-600">{app.roleTitle}</p>
          <div className="mt-2 flex items-center gap-3 text-sm text-neutral-500">
            <span>{"★".repeat(app.company.interestLevel)}{"☆".repeat(5 - app.company.interestLevel)}</span>
            {app.source && <span>via {app.source}</span>}
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
                <span className="text-xs text-neutral-400">{e.eventDate}</span>
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
            <p className="text-sm text-neutral-400">No follow-ups set.</p>
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
              <span className={f.done ? "text-neutral-400 line-through" : ""}>
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
