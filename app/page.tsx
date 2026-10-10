import Link from "next/link";
import { getDashboardData } from "@/lib/actions/actions";

export default async function DashboardPage() {
  const apps = await getDashboardData();

  if (apps.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 p-10 text-center">
        <p className="text-neutral-500">
          No applications yet. Add your first one to get started.
        </p>
        <Link
          href="/applications/new"
          className="mt-4 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          + New application
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center rounded-lg border border-dashed border-neutral-300 p-10 text-center text-neutral-500">
      Select an application from the list to see details.
    </div>
  );
}
