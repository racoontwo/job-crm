// Applications and companies: reads, plus the writes that more than the
// pages need (the MCP server in mcp/ uses these too). Dual backend like the
// rest of lib/db, and free of next/* imports so it runs outside Next.js —
// lib/actions/actions.ts wraps these with revalidatePath/redirect.

import { ObjectId } from "mongodb";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, applications, statusEvents, followUps } from "@/lib/db/schema";
import { getMongoStatus } from "@/lib/db/mongoStatus";
import {
  companiesCollection,
  applicationsCollection,
  type ApplicationDoc,
  type CompanyDoc,
  type StatusEventDoc,
} from "@/lib/db/mongoCollections";
import type {
  ApplicationSummary,
  DashboardApplication,
  StatusEventSummary,
  FollowUpSummary,
} from "@/lib/db/types";

export function today() {
  return new Date().toISOString().slice(0, 10);
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

export type NewApplicationInput = {
  companyName: string;
  website: string | null;
  industry: string | null;
  interestLevel: number;
  roleTitle: string;
  roleDescription: string | null;
  source: string | null;
  jobUrl: string | null;
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
    status: "To apply",
    note: null,
    eventDate: today(),
    createdAt: new Date().toISOString(),
  };

  const result = await appsCol.insertOne({
    companyId,
    roleTitle: input.roleTitle,
    roleDescription: input.roleDescription,
    coverLetter: null,
    source: input.source,
    jobUrl: input.jobUrl,
    appliedDate: null,
    currentStatus: "To apply",
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
      currentStatus: "To apply",
    })
    .returning();

  await db.insert(statusEvents).values({
    applicationId: app.id,
    status: "To apply",
    eventDate: today(),
  });

  return String(app.id);
}

// Saves a new job as "To apply", reusing the company if one with that exact
// name exists. Returns the new application's id.
export async function createApplication(input: NewApplicationInput): Promise<string> {
  const status = await getMongoStatus();
  return status.connected
    ? createCompanyAndApplicationInMongo(input)
    : createCompanyAndApplicationInSqlite(input);
}

// Adds a status update and makes it the current status. The first "Applied"
// also records the applied date.
export async function recordStatusEvent(
  applicationId: string,
  status: string,
  note: string | null,
  eventDate: string
): Promise<void> {
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
    if (status === "Applied") {
      await appsCol.updateOne(
        { _id: new ObjectId(applicationId), appliedDate: null },
        { $set: { appliedDate: eventDate } }
      );
    }
  } else {
    const numericId = Number(applicationId);
    await db.insert(statusEvents).values({ applicationId: numericId, status, note, eventDate });
    await db.update(applications).set({ currentStatus: status }).where(eq(applications.id, numericId));
    if (status === "Applied") {
      await db
        .update(applications)
        .set({ appliedDate: eventDate })
        .where(and(eq(applications.id, numericId), isNull(applications.appliedDate)));
    }
  }
}
