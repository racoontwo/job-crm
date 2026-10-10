"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { getDashboardData } from "@/lib/actions/actions";

const STATUS_COLORS: Record<string, string> = {
  "To apply": "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200",
  Applied: "bg-blue-100 text-blue-800",
  Screening: "bg-amber-100 text-amber-800",
  Interviewing: "bg-purple-100 text-purple-800",
  Offer: "bg-green-100 text-green-800",
  Rejected: "bg-neutral-200 text-neutral-600",
  Withdrawn: "bg-neutral-200 text-neutral-600",
};

export default function AppRowLink({
  app,
}: {
  app: Awaited<ReturnType<typeof getDashboardData>>[number];
}) {
  const pathname = usePathname();
  const selected = pathname === `/applications/${app.id}`;
  const stale = app.daysSinceUpdate !== null && app.daysSinceUpdate >= 10;

  return (
    <Link
      href={`/applications/${app.id}`}
      className={`block rounded-md border px-3 py-2 text-sm transition-colors ${
        selected
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-transparent hover:bg-neutral-100"
      }`}
    >
      <p className="truncate font-medium">{app.company.name}</p>
      <p className={`truncate text-xs ${selected ? "text-neutral-300" : "text-neutral-600"}`}>
        {app.roleTitle}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            selected
              ? "bg-white/20 text-white"
              : STATUS_COLORS[app.currentStatus] ?? "bg-neutral-100 text-neutral-700"
          }`}
        >
          {app.currentStatus}
        </span>
        {app.openFollowUps.length > 0 && (
          <span className={`text-[10px] ${selected ? "text-orange-200" : "text-orange-700"}`}>
            {app.openFollowUps.length} follow-up{app.openFollowUps.length > 1 ? "s" : ""}
          </span>
        )}
        {app.daysSinceUpdate !== null && (
          <span
            className={`ml-auto shrink-0 text-[10px] ${
              selected
                ? "text-neutral-300"
                : stale
                ? "font-medium text-red-600"
                : "text-neutral-500"
            }`}
          >
            {app.daysSinceUpdate === 0 ? "today" : `${app.daysSinceUpdate}d`}
          </span>
        )}
      </div>
    </Link>
  );
}
