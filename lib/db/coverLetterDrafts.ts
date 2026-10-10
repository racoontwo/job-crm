// Cover-letter generation history: one record per "Generate" click, moving
// queued → generating → ready | failed as lib/coverLetterPipeline.ts runs it.
//
// Same dual-backend split and next/*-free rule as lib/db/coverLetters.ts.

import { ObjectId } from "mongodb";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { coverLetterDrafts } from "@/lib/db/schema";
import { getMongoStatus } from "@/lib/db/mongoStatus";
import {
  coverLetterDraftsCollection,
  type CoverLetterDraftDoc,
  type CoverLetterDraftStatus,
} from "@/lib/db/mongoCollections";

export type CoverLetterProvider = "claude" | "gemini";

export type CoverLetterDraft = {
  id: string;
  applicationId: string;
  status: CoverLetterDraftStatus;
  provider: CoverLetterProvider;
  model: string | null;
  letter: string | null;
  error: string | null;
  prompt: string | null;
  exampleCount: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

type DraftUpdate = Partial<
  Pick<
    CoverLetterDraft,
    "status" | "model" | "letter" | "error" | "prompt" | "exampleCount" | "startedAt" | "finishedAt"
  >
>;

// A draft still queued/generating after this long was cut off — most likely
// the dev server restarted mid-run. The CLI provider itself gives up at 2 min.
const STUCK_AFTER_MS = 5 * 60 * 1000;

function fromMongo(d: CoverLetterDraftDoc & { _id: ObjectId }): CoverLetterDraft {
  return {
    id: d._id.toString(),
    applicationId: d.applicationId.toString(),
    status: d.status,
    provider: d.provider,
    model: d.model,
    letter: d.letter,
    error: d.error,
    prompt: d.prompt,
    exampleCount: d.exampleCount,
    createdAt: d.createdAt,
    startedAt: d.startedAt,
    finishedAt: d.finishedAt,
  };
}

function fromSqlite(r: typeof coverLetterDrafts.$inferSelect): CoverLetterDraft {
  return {
    id: String(r.id),
    applicationId: String(r.applicationId),
    status: r.status as CoverLetterDraftStatus,
    provider: r.provider as CoverLetterProvider,
    model: r.model,
    letter: r.letter,
    error: r.error,
    prompt: r.prompt,
    exampleCount: r.exampleCount,
    createdAt: r.createdAt,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
  };
}

export async function createDraft(
  applicationId: string,
  provider: CoverLetterProvider
): Promise<string> {
  const createdAt = new Date().toISOString();
  const status = await getMongoStatus();
  if (status.connected) {
    const col = await coverLetterDraftsCollection();
    const { insertedId } = await col.insertOne({
      applicationId: new ObjectId(applicationId),
      status: "queued",
      provider,
      model: null,
      letter: null,
      error: null,
      prompt: null,
      exampleCount: null,
      createdAt,
      startedAt: null,
      finishedAt: null,
    });
    return insertedId.toString();
  }
  const [row] = await db
    .insert(coverLetterDrafts)
    .values({ applicationId: Number(applicationId), status: "queued", provider, createdAt })
    .returning();
  return String(row.id);
}

export async function updateDraft(id: string, update: DraftUpdate): Promise<void> {
  const status = await getMongoStatus();
  if (status.connected) {
    const col = await coverLetterDraftsCollection();
    await col.updateOne({ _id: new ObjectId(id) }, { $set: update });
    return;
  }
  await db.update(coverLetterDrafts).set(update).where(eq(coverLetterDrafts.id, Number(id)));
}

export async function getDraft(id: string): Promise<CoverLetterDraft | null> {
  const status = await getMongoStatus();
  if (status.connected) {
    if (!ObjectId.isValid(id)) return null;
    const col = await coverLetterDraftsCollection();
    const d = await col.findOne({ _id: new ObjectId(id) });
    return d ? fromMongo(d) : null;
  }
  const [r] = await db
    .select()
    .from(coverLetterDrafts)
    .where(eq(coverLetterDrafts.id, Number(id)))
    .limit(1);
  return r ? fromSqlite(r) : null;
}

// Newest first. Drafts stuck mid-run are marked failed on the way out, so the
// page stops waiting on something that will never finish.
export async function listDrafts(applicationId: string): Promise<CoverLetterDraft[]> {
  const status = await getMongoStatus();
  let drafts: CoverLetterDraft[];
  if (status.connected) {
    if (!ObjectId.isValid(applicationId)) return [];
    const col = await coverLetterDraftsCollection();
    const docs = await col
      .find({ applicationId: new ObjectId(applicationId) })
      .sort({ createdAt: -1 })
      .toArray();
    drafts = docs.map(fromMongo);
  } else {
    const rows = await db
      .select()
      .from(coverLetterDrafts)
      .where(eq(coverLetterDrafts.applicationId, Number(applicationId)))
      .orderBy(desc(coverLetterDrafts.createdAt));
    drafts = rows.map(fromSqlite);
  }

  const now = Date.now();
  for (const draft of drafts) {
    const active = draft.status === "queued" || draft.status === "generating";
    if (active && now - new Date(draft.createdAt).getTime() > STUCK_AFTER_MS) {
      const update = {
        status: "failed" as const,
        error: "Interrupted — the server probably restarted while this was generating. Try again.",
        finishedAt: new Date().toISOString(),
      };
      await updateDraft(draft.id, update);
      Object.assign(draft, update);
    }
  }
  return drafts;
}

export async function deleteDraftsForApplication(applicationId: string): Promise<void> {
  const status = await getMongoStatus();
  if (status.connected) {
    const col = await coverLetterDraftsCollection();
    await col.deleteMany({ applicationId: new ObjectId(applicationId) });
  }
  // SQLite: removed by the foreign key's ON DELETE CASCADE.
}
