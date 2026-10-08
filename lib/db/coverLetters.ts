// Cover-letter reads/writes, shared between the Next.js action layer and any
// standalone script. Deliberately free of `next/*` imports and the
// "use server" directive so it stays callable outside a request context.
//
// Same dual-backend branch as the rest of the data layer: Mongo when it's
// connected, local SQLite otherwise (see lib/db/mongoStatus.ts).

import { ObjectId } from "mongodb";
import { eq, isNotNull, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications } from "@/lib/db/schema";
import { getMongoStatus } from "@/lib/db/mongoStatus";
import { applicationsCollection, companiesCollection } from "@/lib/db/mongoCollections";

const ROLE_DESCRIPTION_EXCERPT_CHARS = 1500;

export type CoverLetterContext = {
  id: string;
  roleTitle: string;
  roleDescription: string | null;
  source: string | null;
  jobUrl: string | null;
  coverLetter: string | null;
  company: {
    name: string;
    website: string | null;
    industry: string | null;
    notes: string | null;
  };
};

export type CoverLetterExample = {
  companyName: string | null;
  industry: string | null;
  roleTitle: string | null;
  roleDescriptionExcerpt: string | null;
  letter: string;
};

function excerpt(text: string | null): string | null {
  if (!text) return null;
  return text.length > ROLE_DESCRIPTION_EXCERPT_CHARS
    ? `${text.slice(0, ROLE_DESCRIPTION_EXCERPT_CHARS)}…`
    : text;
}

export async function getCoverLetterContext(id: string): Promise<CoverLetterContext | null> {
  const status = await getMongoStatus();

  if (status.connected) {
    if (!ObjectId.isValid(id)) return null;
    const appsCol = await applicationsCollection();
    const companiesCol = await companiesCollection();
    const doc = await appsCol.findOne({ _id: new ObjectId(id) });
    if (!doc) return null;
    const company = await companiesCol.findOne({ _id: doc.companyId });
    if (!company) return null;

    return {
      id: doc._id.toString(),
      roleTitle: doc.roleTitle,
      roleDescription: doc.roleDescription,
      source: doc.source,
      jobUrl: doc.jobUrl,
      coverLetter: doc.coverLetter ?? null,
      company: {
        name: company.name,
        website: company.website,
        industry: company.industry,
        notes: company.notes,
      },
    };
  }

  const numericId = Number(id);
  if (Number.isNaN(numericId)) return null;
  const row = await db.query.applications.findFirst({
    where: eq(applications.id, numericId),
    with: { company: true },
  });
  if (!row) return null;

  return {
    id: String(row.id),
    roleTitle: row.roleTitle,
    roleDescription: row.roleDescription,
    source: row.source,
    jobUrl: row.jobUrl,
    coverLetter: row.coverLetter,
    company: {
      name: row.company.name,
      website: row.company.website,
      industry: row.company.industry,
      notes: row.company.notes,
    },
  };
}

export async function setCoverLetter(
  id: string,
  text: string | null
): Promise<{ backend: "mongo" | "sqlite"; updated: boolean }> {
  const status = await getMongoStatus();

  if (status.connected) {
    if (!ObjectId.isValid(id)) return { backend: "mongo", updated: false };
    const appsCol = await applicationsCollection();
    const result = await appsCol.updateOne(
      { _id: new ObjectId(id) },
      { $set: { coverLetter: text } }
    );
    return { backend: "mongo", updated: result.matchedCount > 0 };
  }

  const numericId = Number(id);
  if (Number.isNaN(numericId)) return { backend: "sqlite", updated: false };
  const result = await db
    .update(applications)
    .set({ coverLetter: text })
    .where(eq(applications.id, numericId));
  return { backend: "sqlite", updated: result.changes > 0 };
}

// The "memory": previously saved letters become few-shot examples for the
// next generation. Because the stored letter is whatever the user last saved
// — edits included — approving an edited draft is what teaches the next one.
export async function getCoverLetterExamples(
  excludeId: string,
  limit = 4
): Promise<CoverLetterExample[]> {
  const status = await getMongoStatus();

  if (status.connected) {
    const appsCol = await applicationsCollection();
    const companiesCol = await companiesCollection();
    const docs = await appsCol
      .find({ coverLetter: { $nin: [null, ""] } })
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .toArray();

    const usable = docs.filter((d) => d._id.toString() !== excludeId).slice(0, limit);
    if (usable.length === 0) return [];

    const companyDocs = await companiesCol
      .find({ _id: { $in: usable.map((d) => d.companyId) } })
      .toArray();
    const companyMap = new Map(companyDocs.map((c) => [c._id!.toString(), c]));

    return usable.map((d) => {
      const company = companyMap.get(d.companyId.toString());
      return {
        companyName: company?.name ?? "Unknown company",
        industry: company?.industry ?? null,
        roleTitle: d.roleTitle,
        roleDescriptionExcerpt: excerpt(d.roleDescription),
        letter: d.coverLetter as string,
      };
    });
  }

  const numericExcludeId = Number(excludeId);
  const rows = await db.query.applications.findMany({
    where: isNotNull(applications.coverLetter),
    with: { company: true },
    orderBy: [desc(applications.createdAt)],
    limit: limit + 1,
  });

  return rows
    .filter((r) => r.id !== numericExcludeId && (r.coverLetter ?? "").trim() !== "")
    .slice(0, limit)
    .map((r) => ({
      companyName: r.company.name,
      industry: r.company.industry,
      roleTitle: r.roleTitle,
      roleDescriptionExcerpt: excerpt(r.roleDescription),
      letter: r.coverLetter as string,
    }));
}
