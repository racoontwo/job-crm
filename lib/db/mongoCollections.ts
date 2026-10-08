// Document shapes for the Mongo/Atlas backend. Mirrors lib/db/schema.ts's
// four SQLite tables, but status events and follow-ups are embedded arrays
// on the application document (the natural shape for a document DB, and
// they're never queried independently of their parent application).

import { ObjectId } from "mongodb";
import { getMongoDb } from "./mongo";

export type CompanyDoc = {
  _id?: ObjectId;
  name: string;
  website: string | null;
  industry: string | null;
  notes: string | null;
  interestLevel: number;
  createdAt: string;
};

export type StatusEventDoc = {
  _id: ObjectId;
  status: string;
  note: string | null;
  eventDate: string;
  createdAt: string;
};

export type FollowUpDoc = {
  _id: ObjectId;
  dueDate: string;
  note: string | null;
  done: boolean;
  createdAt: string;
};

export type ApplicationDoc = {
  _id?: ObjectId;
  companyId: ObjectId;
  roleTitle: string;
  roleDescription: string | null;
  coverLetter: string | null;
  source: string | null;
  appliedDate: string;
  currentStatus: string;
  jobUrl: string | null;
  createdAt: string;
  statusEvents: StatusEventDoc[];
  followUps: FollowUpDoc[];
};

async function requireDb() {
  const db = await getMongoDb();
  if (!db) throw new Error("MongoDB is not configured.");
  return db;
}

export async function companiesCollection() {
  const db = await requireDb();
  return db.collection<CompanyDoc>("companies");
}

export async function applicationsCollection() {
  const db = await requireDb();
  return db.collection<ApplicationDoc>("applications");
}
