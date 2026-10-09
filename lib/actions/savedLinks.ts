"use server";

// Step 1 of the new-application flow: the inbox of links shared from the
// phone (via the hosted capture endpoint, Mongo only) or pasted in here.
// Same dual-backend split as lib/actions/actions.ts.

import { ObjectId } from "mongodb";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { savedLinks } from "@/lib/db/schema";
import { savedLinksCollection } from "@/lib/db/mongoCollections";
import { getMongoStatus } from "@/lib/db/mongoStatus";
import type { SavedLinkSummary } from "@/lib/db/types";
import { parseSharedLink } from "@/lib/sharedLink";

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

  const status = await getMongoStatus();
  if (status.connected) {
    const col = await savedLinksCollection();
    await col.insertOne({
      url: parsed.url,
      sharedText: parsed.sharedText,
      status: "new",
      applicationId: null,
      receivedAt: new Date().toISOString(),
    });
  } else {
    await db.insert(savedLinks).values({ url: parsed.url, sharedText: parsed.sharedText });
  }

  revalidatePath("/inbox");
}

export async function dismissSavedLink(formData: FormData) {
  const id = (formData.get("savedLinkId") as string)?.trim();
  if (!id) throw new Error("Missing saved link id.");

  const status = await getMongoStatus();
  if (status.connected) {
    const col = await savedLinksCollection();
    await col.updateOne({ _id: new ObjectId(id) }, { $set: { status: "dismissed" } });
  } else {
    await db.update(savedLinks).set({ status: "dismissed" }).where(eq(savedLinks.id, Number(id)));
  }

  revalidatePath("/inbox");
}

// Called once an application has been saved (step 2 → 3). Matches by the
// saved link's id when the flow started from the inbox, otherwise by URL so
// links handled another way (e.g. the Glassdoor userscript) still leave the
// inbox.
export async function markSavedLinkDone(
  applicationId: string,
  { savedLinkId, jobUrl }: { savedLinkId: string | null; jobUrl: string | null }
) {
  if (!savedLinkId && !jobUrl) return;

  const status = await getMongoStatus();
  if (status.connected) {
    const col = await savedLinksCollection();
    const filter =
      savedLinkId && ObjectId.isValid(savedLinkId)
        ? { _id: new ObjectId(savedLinkId) }
        : { url: jobUrl!, status: "new" as const };
    await col.updateMany(filter, {
      $set: { status: "done", applicationId: new ObjectId(applicationId) },
    });
  } else {
    const where = savedLinkId
      ? eq(savedLinks.id, Number(savedLinkId))
      : and(eq(savedLinks.url, jobUrl!), eq(savedLinks.status, "new"));
    await db
      .update(savedLinks)
      .set({ status: "done", applicationId: Number(applicationId) })
      .where(where);
  }

  revalidatePath("/inbox");
}
