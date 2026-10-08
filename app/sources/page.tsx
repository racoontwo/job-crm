import { JOB_SOURCES, type JobSourceStatus } from "@/lib/jobSources";

const STATUS_LABEL: Record<JobSourceStatus, string> = {
  working: "Working",
  blocked: "Blocked",
  unverified: "Unverified",
};

const STATUS_COLORS: Record<JobSourceStatus, string> = {
  working: "bg-green-100 text-green-800",
  blocked: "bg-red-100 text-red-800",
  unverified: "bg-neutral-200 text-neutral-600",
};

export default function SourcesPage() {
  const sources = [...JOB_SOURCES].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Job board sources</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Sites the paste-URL flow on{" "}
        <span className="font-medium text-neutral-700">New application</span> knows how
        to parse. &quot;Unverified&quot; means it isn&apos;t known to be blocked, but nobody
        has confirmed a live fetch against it yet.
      </p>

      <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Last verified</th>
              <th className="px-4 py-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {sources.map((source) => (
              <tr key={source.domain}>
                <td className="whitespace-nowrap px-4 py-2 font-medium text-neutral-800">
                  {source.label}
                  <span className="ml-2 text-xs font-normal text-neutral-400">
                    {source.domain}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[source.status]}`}
                  >
                    {STATUS_LABEL[source.status]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-neutral-500">
                  {source.lastVerified ?? "—"}
                </td>
                <td className="px-4 py-2 text-neutral-500">{source.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
