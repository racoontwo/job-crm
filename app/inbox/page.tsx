import Link from "next/link";
import { dismissSavedLink, getNewSavedLinks, saveLink } from "@/lib/actions/savedLinks";
import { getMongoStatus } from "@/lib/db/mongoStatus";
import { inferSourceLabel } from "@/lib/jobSources";
import FlowSteps from "@/components/FlowSteps";

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatReceived(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function InboxPage() {
  const [links, dbStatus] = await Promise.all([getNewSavedLinks(), getMongoStatus()]);

  return (
    <div className="mx-auto max-w-2xl">
      <FlowSteps current={1} />
      <h1 className="text-xl font-semibold">Saved links</h1>
      <p className="mt-1 mb-6 text-sm text-neutral-500">
        Job postings you&apos;ve shared from your phone or pasted below. Fetch the details when
        you&apos;re ready to apply.
      </p>

      {!dbStatus.connected && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Running on local SQLite — links shared from your phone go to Atlas and only show up
          here when MongoDB is connected.
        </p>
      )}

      <form action={saveLink} className="mb-8 flex gap-2">
        <input
          name="link"
          required
          placeholder="Paste a job posting link…"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Save link
        </button>
      </form>

      {links.length === 0 ? (
        <p className="text-sm text-neutral-400">
          Nothing waiting. Share a job posting from your phone to see it here.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
          {links.map((link) => (
            <li key={link.id} className="flex items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {link.sharedText ?? inferSourceLabel(hostnameOf(link.url))}
                </p>
                <p className="truncate text-xs text-neutral-400">
                  {formatReceived(link.receivedAt)} · {link.url}
                </p>
              </div>
              <form action={dismissSavedLink}>
                <input type="hidden" name="savedLinkId" value={link.id} />
                <button
                  type="submit"
                  className="rounded-md px-2 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100"
                >
                  Dismiss
                </button>
              </form>
              <Link
                href={`/applications/new?saved=${link.id}`}
                className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
              >
                Fetch details →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
