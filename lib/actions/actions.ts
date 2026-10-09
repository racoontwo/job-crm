"use server";

import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import { companies, applications, statusEvents, followUps } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { extractJobPostingFromUrl, type ExtractedJobPosting } from "@/lib/jobPosting";
import { getMongoStatus, type DatabaseStatus } from "@/lib/db/mongoStatus";
import {
  getCoverLetterContext,
  setCoverLetter,
  getCoverLetterExamples,
} from "@/lib/db/coverLetters";
import {
  readProfile,
  draftCoverLetter,
  draftCoverLetterViaClaudeCli,
  readFileExamples,
} from "@/lib/coverLetterGenerator";
import {
  getResume,
  saveResume,
  getWritingStyle,
  saveWritingStyle,
  listNotes,
  saveNote,
  deleteNote,
  listExamples,
  saveExample,
  deleteExample,
} from "@/lib/profileFiles";
import {
  companiesCollection,
  applicationsCollection,
  type ApplicationDoc,
  type CompanyDoc,
  type StatusEventDoc,
  type FollowUpDoc,
} from "@/lib/db/mongoCollections";
import type {
  ApplicationSummary,
  DashboardApplication,
  StatusEventSummary,
  FollowUpSummary,
} from "@/lib/db/types";
import { markSavedLinkDone } from "@/lib/actions/savedLinks";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function getDatabaseStatus(): Promise<DatabaseStatus> {
  return getMongoStatus();
}

export async function extractJobPosting(url: string): Promise<ExtractedJobPosting> {
  return extractJobPostingFromUrl(url);
}

// ---------------------------------------------------------------------------
// SQLite (local, fallback) row shapes + mapping to the shared summary types
// ---------------------------------------------------------------------------

type SqliteApplicationRow = typeof applications.$inferSelect & {
  company: typeof companies.$inferSelect;
  statusEvents: (typeof statusEvents.$inferSelect)[];
  followUps: (typeof followUps.$inferSelect)[];
};

function mapSqliteApp(a: SqliteApplicationRow): ApplicationSummary {
  return {
    id: String(a.id),
    roleTitle: a.roleTitle,
    roleDescription: a.roleDescription,
    coverLetter: a.coverLetter,
    source: a.source,
    appliedDate: a.appliedDate,
    currentStatus: a.currentStatus,
    jobUrl: a.jobUrl,
    createdAt: a.createdAt,
    company: {
      id: String(a.company.id),
      name: a.company.name,
      website: a.company.website,
      industry: a.company.industry,
      notes: a.company.notes,
      interestLevel: a.company.interestLevel,
    },
    statusEvents: a.statusEvents.map((e) => ({
      id: String(e.id),
      status: e.status,
      note: e.note,
      eventDate: e.eventDate,
    })),
    followUps: a.followUps.map((f) => ({
      id: String(f.id),
      dueDate: f.dueDate,
      note: f.note,
      done: f.done,
    })),
  };
}

function withDashboardFields(summary: ApplicationSummary): DashboardApplication {
  const lastEvent = [...summary.statusEvents].sort((x, y) =>
    y.eventDate.localeCompare(x.eventDate)
  )[0];
  const daysSinceUpdate = lastEvent
    ? Math.floor((Date.now() - new Date(lastEvent.eventDate).getTime()) / 86400000)
    : null;
  const openFollowUps = summary.followUps.filter((f) => !f.done);
  return { ...summary, daysSinceUpdate, openFollowUps };
}

// ---------------------------------------------------------------------------
// Mongo mapping to the shared summary types
// ---------------------------------------------------------------------------

function mapMongoApp(
  doc: ApplicationDoc & { _id: ObjectId },
  company: CompanyDoc & { _id: ObjectId }
): ApplicationSummary {
  return {
    id: doc._id.toString(),
    roleTitle: doc.roleTitle,
    roleDescription: doc.roleDescription,
    coverLetter: doc.coverLetter ?? null,
    source: doc.source,
    appliedDate: doc.appliedDate,
    currentStatus: doc.currentStatus,
    jobUrl: doc.jobUrl,
    createdAt: doc.createdAt,
    company: {
      id: company._id.toString(),
      name: company.name,
      website: company.website,
      industry: company.industry,
      notes: company.notes,
      interestLevel: company.interestLevel,
    },
    statusEvents: doc.statusEvents
      .map((e): StatusEventSummary => ({
        id: e._id.toString(),
        status: e.status,
        note: e.note,
        eventDate: e.eventDate,
      }))
      .sort((x, y) => y.eventDate.localeCompare(x.eventDate)),
    followUps: doc.followUps
      .map((f): FollowUpSummary => ({
        id: f._id.toString(),
        dueDate: f.dueDate,
        note: f.note,
        done: f.done,
      }))
      .sort((x, y) => y.dueDate.localeCompare(x.dueDate)),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getCompanyNames(): Promise<{ id: string; name: string }[]> {
  const status = await getMongoStatus();
  if (status.connected) {
    const col = await companiesCollection();
    const docs = await col.find().project<{ _id: ObjectId; name: string }>({ name: 1 }).toArray();
    return docs.map((d) => ({ id: d._id.toString(), name: d.name }));
  }
  const rows = await db.query.companies.findMany();
  return rows.map((c) => ({ id: String(c.id), name: c.name }));
}

async function getDashboardDataFromMongo(): Promise<DashboardApplication[]> {
  const appsCol = await applicationsCollection();
  const companiesCol = await companiesCollection();

  const [apps, companyDocs] = await Promise.all([
    appsCol.find().sort({ createdAt: -1 }).toArray(),
    companiesCol.find().toArray(),
  ]);
  const companyMap = new Map(companyDocs.map((c) => [c._id!.toString(), c]));

  return apps
    .map((a) => {
      const company = companyMap.get(a.companyId.toString());
      if (!company) return null;
      return withDashboardFields(mapMongoApp(a, company));
    })
    .filter((a): a is DashboardApplication => a !== null)
    .sort((a, b) => (b.daysSinceUpdate ?? 0) - (a.daysSinceUpdate ?? 0));
}

async function getDashboardDataFromSqlite(): Promise<DashboardApplication[]> {
  const apps = (await db.query.applications.findMany({
    with: { company: true, statusEvents: true, followUps: true },
    orderBy: [desc(applications.createdAt)],
  })) as SqliteApplicationRow[];

  return apps
    .map((a) => withDashboardFields(mapSqliteApp(a)))
    .sort((a, b) => (b.daysSinceUpdate ?? 0) - (a.daysSinceUpdate ?? 0));
}

export async function getDashboardData(): Promise<DashboardApplication[]> {
  const status = await getMongoStatus();
  return status.connected ? getDashboardDataFromMongo() : getDashboardDataFromSqlite();
}

async function getApplicationFromMongo(id: string): Promise<ApplicationSummary | undefined> {
  if (!ObjectId.isValid(id)) return undefined;
  const appsCol = await applicationsCollection();
  const companiesCol = await companiesCollection();
  const doc = await appsCol.findOne({ _id: new ObjectId(id) });
  if (!doc) return undefined;
  const company = await companiesCol.findOne({ _id: doc.companyId });
  if (!company) return undefined;
  return mapMongoApp(doc, company);
}

async function getApplicationFromSqlite(id: string): Promise<ApplicationSummary | undefined> {
  const numericId = Number(id);
  if (Number.isNaN(numericId)) return undefined;
  const app = (await db.query.applications.findFirst({
    where: eq(applications.id, numericId),
    with: {
      company: true,
      statusEvents: { orderBy: [desc(statusEvents.eventDate)] },
      followUps: { orderBy: [desc(followUps.dueDate)] },
    },
  })) as SqliteApplicationRow | undefined;
  return app ? mapSqliteApp(app) : undefined;
}

export async function getApplication(id: string): Promise<ApplicationSummary | undefined> {
  const status = await getMongoStatus();
  return status.connected ? getApplicationFromMongo(id) : getApplicationFromSqlite(id);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

type NewApplicationInput = {
  companyName: string;
  website: string | null;
  industry: string | null;
  interestLevel: number;
  roleTitle: string;
  roleDescription: string | null;
  source: string | null;
  jobUrl: string | null;
  appliedDate: string;
};

async function createCompanyAndApplicationInMongo(input: NewApplicationInput): Promise<string> {
  const companiesCol = await companiesCollection();
  const appsCol = await applicationsCollection();

  const existing = await companiesCol.findOne({ name: input.companyName });
  const companyId =
    existing?._id ??
    (
      await companiesCol.insertOne({
        name: input.companyName,
        website: input.website,
        industry: input.industry,
        notes: null,
        interestLevel: input.interestLevel,
        createdAt: new Date().toISOString(),
      })
    ).insertedId;

  const initialStatusEvent: StatusEventDoc = {
    _id: new ObjectId(),
    status: "Applied",
    note: null,
    eventDate: input.appliedDate,
    createdAt: new Date().toISOString(),
  };

  const result = await appsCol.insertOne({
    companyId,
    roleTitle: input.roleTitle,
    roleDescription: input.roleDescription,
    coverLetter: null,
    source: input.source,
    jobUrl: input.jobUrl,
    appliedDate: input.appliedDate,
    currentStatus: "Applied",
    createdAt: new Date().toISOString(),
    statusEvents: [initialStatusEvent],
    followUps: [],
  });

  return result.insertedId.toString();
}

async function createCompanyAndApplicationInSqlite(input: NewApplicationInput): Promise<string> {
  let companyId: number;
  const existing = await db
    .select()
    .from(companies)
    .where(eq(companies.name, input.companyName))
    .limit(1);

  if (existing.length > 0) {
    companyId = existing[0].id;
  } else {
    const [created] = await db
      .insert(companies)
      .values({
        name: input.companyName,
        website: input.website,
        industry: input.industry,
        interestLevel: input.interestLevel,
      })
      .returning();
    companyId = created.id;
  }

  const [app] = await db
    .insert(applications)
    .values({
      companyId,
      roleTitle: input.roleTitle,
      roleDescription: input.roleDescription,
      source: input.source,
      jobUrl: input.jobUrl,
      appliedDate: input.appliedDate,
      currentStatus: "Applied",
    })
    .returning();

  await db.insert(statusEvents).values({
    applicationId: app.id,
    status: "Applied",
    eventDate: input.appliedDate,
  });

  return String(app.id);
}

export async function createCompanyAndApplication(formData: FormData) {
  const companyName = (formData.get("companyName") as string)?.trim();
  const website = (formData.get("website") as string)?.trim() || null;
  const industry = (formData.get("industry") as string)?.trim() || null;
  const interestLevel = Number(formData.get("interestLevel") || 3);
  const roleTitle = (formData.get("roleTitle") as string)?.trim();
  const roleDescription = (formData.get("roleDescription") as string)?.trim() || null;
  const source = (formData.get("source") as string)?.trim() || null;
  const jobUrl = (formData.get("jobUrl") as string)?.trim() || null;
  const appliedDate = (formData.get("appliedDate") as string) || today();
  const savedLinkId = (formData.get("savedLinkId") as string)?.trim() || null;

  if (!companyName || !roleTitle) {
    throw new Error("Company name and role title are required.");
  }

  const input: NewApplicationInput = {
    companyName,
    website,
    industry,
    interestLevel,
    roleTitle,
    roleDescription,
    source,
    jobUrl,
    appliedDate,
  };

  const status = await getMongoStatus();
  const appId = status.connected
    ? await createCompanyAndApplicationInMongo(input)
    : await createCompanyAndApplicationInSqlite(input);

  await markSavedLinkDone(appId, { savedLinkId, jobUrl });

  revalidatePath("/");
  redirect(`/applications/${appId}?step=cover-letter#cover-letter`);
}

export async function addStatusEvent(formData: FormData) {
  const applicationId = (formData.get("applicationId") as string)?.trim();
  const status = (formData.get("status") as string)?.trim();
  const note = (formData.get("note") as string)?.trim() || null;
  const eventDate = (formData.get("eventDate") as string) || today();

  if (!applicationId || !status) throw new Error("Missing status event fields.");

  const dbStatus = await getMongoStatus();
  if (dbStatus.connected) {
    const appsCol = await applicationsCollection();
    const event: StatusEventDoc = {
      _id: new ObjectId(),
      status,
      note,
      eventDate,
      createdAt: new Date().toISOString(),
    };
    await appsCol.updateOne(
      { _id: new ObjectId(applicationId) },
      { $push: { statusEvents: event }, $set: { currentStatus: status } }
    );
  } else {
    const numericId = Number(applicationId);
    await db.insert(statusEvents).values({ applicationId: numericId, status, note, eventDate });
    await db.update(applications).set({ currentStatus: status }).where(eq(applications.id, numericId));
  }

  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/");
}

export async function addFollowUp(formData: FormData) {
  const applicationId = (formData.get("applicationId") as string)?.trim();
  const dueDate = formData.get("dueDate") as string;
  const note = (formData.get("note") as string)?.trim() || null;

  if (!applicationId || !dueDate) throw new Error("Missing follow-up fields.");

  const dbStatus = await getMongoStatus();
  if (dbStatus.connected) {
    const appsCol = await applicationsCollection();
    const followUp: FollowUpDoc = {
      _id: new ObjectId(),
      dueDate,
      note,
      done: false,
      createdAt: new Date().toISOString(),
    };
    await appsCol.updateOne(
      { _id: new ObjectId(applicationId) },
      { $push: { followUps: followUp } }
    );
  } else {
    const numericId = Number(applicationId);
    await db.insert(followUps).values({ applicationId: numericId, dueDate, note });
  }

  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/");
}

export async function generateCoverLetter(
  applicationId: string,
  provider: "gemini" | "claude" = "claude"
) {
  if (!applicationId) throw new Error("Missing application id.");

  const context = await getCoverLetterContext(applicationId);
  if (!context) throw new Error("Couldn't find that application.");

  const profileResult = await readProfile();
  if (!profileResult.ok) {
    throw new Error(profileResult.problems.join(" "));
  }

  const [dbExamples, fileExamples] = await Promise.all([
    getCoverLetterExamples(applicationId),
    readFileExamples(),
  ]);
  const examples = [...fileExamples, ...dbExamples];
  const letter =
    provider === "claude"
      ? await draftCoverLetterViaClaudeCli(context, profileResult.profile, examples)
      : await draftCoverLetter(context, profileResult.profile, examples);

  const { updated } = await setCoverLetter(applicationId, letter);
  if (!updated) throw new Error("Generated the letter but couldn't save it.");

  revalidatePath(`/applications/${applicationId}`);
}

export async function saveCoverLetter(formData: FormData) {
  const applicationId = (formData.get("applicationId") as string)?.trim();
  const text = ((formData.get("coverLetter") as string) ?? "").trim();

  if (!applicationId) throw new Error("Missing application id.");

  const { updated } = await setCoverLetter(applicationId, text || null);
  if (!updated) throw new Error("Couldn't find that application to save to.");

  revalidatePath(`/applications/${applicationId}`);
}

export async function toggleFollowUpDone(followUpId: string, applicationId: string, done: boolean) {
  const status = await getMongoStatus();
  if (status.connected) {
    const appsCol = await applicationsCollection();
    await appsCol.updateOne(
      { _id: new ObjectId(applicationId), "followUps._id": new ObjectId(followUpId) },
      { $set: { "followUps.$.done": done } }
    );
  } else {
    await db.update(followUps).set({ done }).where(eq(followUps.id, Number(followUpId)));
  }

  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/");
}

export async function deleteApplication(applicationId: string) {
  const status = await getMongoStatus();
  if (status.connected) {
    const appsCol = await applicationsCollection();
    await appsCol.deleteOne({ _id: new ObjectId(applicationId) });
  } else {
    await db.delete(applications).where(eq(applications.id, Number(applicationId)));
  }
  revalidatePath("/");
  redirect("/");
}

// ---------------------------------------------------------------------------
// Settings — viewing/editing/uploading/deleting the profile/ documents the
// cover-letter generator reads (see lib/coverLetterGenerator.ts, lib/profileFiles.ts).

export async function getProfileSettings() {
  const [resume, writingStyle, notes, examples] = await Promise.all([
    getResume(),
    getWritingStyle(),
    listNotes(),
    listExamples(),
  ]);
  return { resume, writingStyle, notes, examples };
}

export async function saveResumeAction(formData: FormData) {
  await saveResume((formData.get("content") as string) ?? "");
  revalidatePath("/settings");
}

export async function saveWritingStyleAction(formData: FormData) {
  await saveWritingStyle((formData.get("content") as string) ?? "");
  revalidatePath("/settings");
}

async function saveUploadedFiles(
  formData: FormData,
  save: (filename: string, content: string) => Promise<void>
) {
  const files = formData.getAll("files");
  for (const file of files) {
    if (!(file instanceof File) || file.size === 0) continue;
    await save(file.name, await file.text());
  }
}

export async function uploadNotesAction(formData: FormData) {
  await saveUploadedFiles(formData, saveNote);
  revalidatePath("/settings");
}

export async function deleteNoteAction(formData: FormData) {
  const filename = formData.get("filename") as string;
  if (filename) await deleteNote(filename);
  revalidatePath("/settings");
}

export async function uploadExamplesAction(formData: FormData) {
  await saveUploadedFiles(formData, saveExample);
  revalidatePath("/settings");
}

export async function deleteExampleAction(formData: FormData) {
  const filename = formData.get("filename") as string;
  if (filename) await deleteExample(filename);
  revalidatePath("/settings");
}
