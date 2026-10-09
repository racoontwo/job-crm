import { getDashboardData } from "@/lib/actions/actions";
import AppRowLink from "./AppRowLink";

const ACTIVE_STATUSES = new Set(["Applied", "Screening", "Interviewing", "Offer"]);

type DashboardApp = Awaited<ReturnType<typeof getDashboardData>>[number];

export default async function ApplicationListPanel() {
  const apps = await getDashboardData();

  if (apps.length === 0) {
    return <p className="p-4 text-sm text-neutral-400">No applications yet.</p>;
  }

  const toApply = apps.filter((a) => a.currentStatus === "To apply");
  const active = apps.filter((a) => ACTIVE_STATUSES.has(a.currentStatus));
  const closed = apps.filter(
    (a) => a.currentStatus !== "To apply" && !ACTIVE_STATUSES.has(a.currentStatus)
  );

  return (
    <div className="divide-y divide-neutral-100">
      {toApply.length > 0 && <ListSection title={`To apply (${toApply.length})`} apps={toApply} />}
      <ListSection title={`Active (${active.length})`} apps={active} />
      {closed.length > 0 && <ListSection title={`Closed (${closed.length})`} apps={closed} />}
    </div>
  );
}

function ListSection({ title, apps }: { title: string; apps: DashboardApp[] }) {
  return (
    <div className="p-3">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {title}
      </h2>
      <div className="space-y-1">
        {apps.map((a) => (
          <AppRowLink key={a.id} app={a} />
        ))}
      </div>
    </div>
  );
}
