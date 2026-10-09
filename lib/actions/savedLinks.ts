"use server";

// Step 1 of the new-application flow: the inbox of links shared from the
// phone (via the hosted capture endpoint, Mongo only) or pasted in here.
// Same dual-backend split as lib/actions/actions.ts.

import { ObjectId } from "mongodb";
import { desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { savedLinks } from "@/lib/db/schema";
import { savedLinksCollection } from "@/lib/db/mongoCollections";
import { getMongoStatus } from "@/lib/db/mongoStatus";
import type { SavedLinkSummary } from "@/lib/db/types";
import { parseSharedLink } from "@/lib/sharedLink";
import { cleanJobUrl, jobUrlKey } from "@/lib/jobUrl";

// SQLite's current_timestamp is "YYYY-MM-DD HH:MM:SS" in UTC; make it ISO so
// both backends hand back the same format.
function sqliteTimestampToIso(ts: string): string {
  return ts.includes("T") ? ts : `${ts.replace(" ", "T")}Z`;
}

export async function getNewSavedLinks(): Promise<SavedLinkSummary[]> {
  const status = await getMongoStatus();
  if (status.connected) {
    const col = await savedLinksCollection();
    const docs = await col.find({ status: "new" }).sort({ receivedAt: -1 }).toArray();
    return docs.map((d) => ({
      id: d._id.toString(),
      url: d.url,
      sharedText: d.sharedText,
      receivedAt: d.receivedAt,
    }));
  }

  const rows = await db
    .select()
    .from(savedLinks)
    .where(eq(savedLinks.status, "new"))
    .orderBy(desc(savedLinks.receivedAt));
  return rows.map((r) => ({
    id: String(r.id),
    url: r.url,
    sharedText: r.sharedText,
    receivedAt: sqliteTimestampToIso(r.receivedAt),
  }));
}

export async function getSavedLink(id: string): Promise<SavedLinkSummary | null> {
  const status = await getMongoStatus();
  if (status.connected) {
    if (!ObjectId.isValid(id)) return null;
    const col = await savedLinksCollection();
    const d = await col.findOne({ _id: new ObjectId(id) });
    return d
      ? { id: d._id.toString(), url: d.url, sharedText: d.sharedText, receivedAt: d.receivedAt }
      : null;
  }

  const [r] = await db.select().from(savedLinks).where(eq(savedLinks.id, Number(id))).limit(1);
  return r
    ? {
        id: String(r.id),
        url: r.url,
        sharedText: r.sharedText,
        receivedAt: sqliteTimestampToIso(r.receivedAt),
      }
    : null;
}

export async function saveLink(formData: FormData) {
  const parsed = parseSharedLink(((formData.get("link") as string) ?? "").trim());
  if (!parsed) throw new Error("That doesn't contain a link.");
  const url = cleanJobUrl(parsed.url);

  const waiting = await getNewSavedLinks();
  if (waiting.some((l) => jobUrlKey(l.url) === jobUrlKey(url))) {
    revalidatePath("/inbox");
    return;
  }

  const status = await getMongoStatus();
  if (status.connected) {
    const col = await savedLinksCollection();
    await col.insertOne({
      url,
      sharedText: parsed.sharedText,
      status: "new",
      applicationId: null,
      receivedAt: new Date().toISOString(),
    });
  } else {
    await db.insert(savedLinks).values({ url, sharedText: parsed.sharedText });
  }

  revalidatePath("/inbox");
}

export async function dismissSavedLink(formData: FormData) {
  // Comma-separated: the inbox dismisses all shares of the same job together.
  const ids = ((formData.get("savedLinkId") as string) ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) throw new Error("Missing saved link id.");

  const status = await getMongoStatus();
  if (status.connected) {
    const col = await savedLinksCollection();
    await col.updateMany(
      { _id: { $in: ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id)) } },
      { $set: { status: "dismissed" } }
    );
  } else {
    await db
      .update(savedLinks)
      .set({ status: "dismissed" })
      .where(inArray(savedLinks.id, ids.map(Number)));
  }

  revalidatePath("/inbox");
}

// Called once an application has been saved (step 2 → 3). Clears the saved
// link it came from plus any other waiting link for the same job — the phone
// endpoint stores URLs as shared, so they're compared by jobUrlKey here
// rather than by exact match. Also covers jobs saved another way (e.g. the
// Glassdoor userscript).
export async function markSavedLinkDone(
  applicationId: string,
  { savedLinkId, jobUrl }: { savedLinkId: string | null; jobUrl: string | null }
) {
  const waiting = await getNewSavedLinks();
  const key = jobUrl ? jobUrlKey(jobUrl) : null;
  const ids = waiting
    .filter((l) => l.id === savedLinkId || (key !== null && jobUrlKey(l.url) === key))
    .map((l) => l.id);
  if (ids.length === 0) return;

  const status = await getMongoStatus();
  if (status.connected) {
    const col = await savedLinksCollection();
    await col.updateMany(
      { _id: { $in: ids.map((id) => new ObjectId(id)) } },
      { $set: { status: "done", applicationId: new ObjectId(applicationId) } }
    );
  } else {
    await db
      .update(savedLinks)
      .set({ status: "done", applicationId: Number(applicationId) })
      .where(inArray(savedLinks.id, ids.map(Number)));
  }

  revalidatePath("/inbox");
}
