// What the cover-letter generator knows about you — resume, writing rules,
// extra notes, past letters — stored in the database (profile_documents /
// profileDocuments). Replaces the old profile/ files; importProfileFiles()
// copies those in once.
//
// Same dual-backend split as the rest of the data layer, and like
// lib/db/coverLetters.ts free of next/* imports so it's usable anywhere.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profileDocuments } from "@/lib/db/schema";
import { getMongoStatus } from "@/lib/db/mongoStatus";
import {
  profileDocumentsCollection,
  type ProfileDocumentKind,
} from "@/lib/db/mongoCollections";
import { PROFILE_DIR, NOTES_DIR, EXAMPLES_DIR, EXAMPLE_EXTENSIONS } from "@/lib/profilePaths";

export type ProfileFileInfo = { filename: string; size: number };
export type ProfileDocument = { name: string; content: string };

const RESUME_NAME = "resume.md";
const WRITING_STYLE_NAME = "writing-style.md";

// ---------------------------------------------------------------------------
// Backend primitives
// ---------------------------------------------------------------------------

async function listDocuments(kind: ProfileDocumentKind): Promise<ProfileDocument[]> {
  const status = await getMongoStatus();
  if (status.connected) {
    const col = await profileDocumentsCollection();
    const docs = await col.find({ kind }).sort({ name: 1 }).toArray();
    return docs.map((d) => ({ name: d.name, content: d.content }));
  }
  const rows = await db
    .select()
    .from(profileDocuments)
    .where(eq(profileDocuments.kind, kind))
    .orderBy(asc(profileDocuments.name));
  return rows.map((r) => ({ name: r.name, content: r.content }));
}

async function upsertDocument(kind: ProfileDocumentKind, name: string, content: string) {
  const updatedAt = new Date().toISOString();
  const status = await getMongoStatus();
  if (status.connected) {
    const col = await profileDocumentsCollection();
    await col.updateOne(
      { kind, name },
      { $set: { content, updatedAt } },
      { upsert: true }
    );
    return;
  }
  const where = and(eq(profileDocuments.kind, kind), eq(profileDocuments.name, name));
  const [existing] = await db.select().from(profileDocuments).where(where).limit(1);
  if (existing) {
    await db.update(profileDocuments).set({ content, updatedAt }).where(where);
  } else {
    await db.insert(profileDocuments).values({ kind, name, content, updatedAt });
  }
}

async function deleteDocument(kind: ProfileDocumentKind, name: string) {
  const status = await getMongoStatus();
  if (status.connected) {
    const col = await profileDocumentsCollection();
    await col.deleteOne({ kind, name });
    return;
  }
  await db
    .delete(profileDocuments)
    .where(and(eq(profileDocuments.kind, kind), eq(profileDocuments.name, name)));
}

async function getSingle(kind: ProfileDocumentKind): Promise<string> {
  const [doc] = await listDocuments(kind);
  return doc?.content ?? "";
}

function toInfo(docs: ProfileDocument[]): ProfileFileInfo[] {
  return docs.map((d) => ({ filename: d.name, size: Buffer.byteLength(d.content, "utf8") }));
}

// Uploaded names are still treated like filenames: bare name, expected
// extension — keeps the Settings page's upload rules unchanged.
function validName(filename: string, extensions: string[]): string {
  const base = path.basename(filename);
  if (!base || base !== filename || base === "." || base === "..") {
    throw new Error(`Invalid filename: "${filename}".`);
  }
  if (!extensions.includes(path.extname(base))) {
    throw new Error(`"${filename}" must be one of: ${extensions.join(", ")}.`);
  }
  return base;
}

// ---------------------------------------------------------------------------
// Settings page (same shape the old profile/ file helpers had)
// ---------------------------------------------------------------------------

export const getResume = () => getSingle("resume");
export const saveResume = (content: string) => upsertDocument("resume", RESUME_NAME, content);
export const getWritingStyle = () => getSingle("writingStyle");
export const saveWritingStyle = (content: string) =>
  upsertDocument("writingStyle", WRITING_STYLE_NAME, content);

export const listNotes = async () => toInfo(await listDocuments("note"));
export const saveNote = (filename: string, content: string) =>
  upsertDocument("note", validName(filename, [".md"]), content);
export const deleteNote = (filename: string) => deleteDocument("note", filename);

export const listExamples = async () => toInfo(await listDocuments("example"));
export const saveExample = (filename: string, content: string) =>
  upsertDocument("example", validName(filename, EXAMPLE_EXTENSIONS), content);
export const deleteExample = (filename: string) => deleteDocument("example", filename);

// ---------------------------------------------------------------------------
// Cover-letter generator
// ---------------------------------------------------------------------------

export const getNoteDocuments = () => listDocuments("note");
export const getExampleDocuments = () => listDocuments("example");

// ---------------------------------------------------------------------------
// One-time move from the old profile/ files
// ---------------------------------------------------------------------------

export async function hasProfileInDatabase(): Promise<boolean> {
  return (await getResume()) !== "" || (await getWritingStyle()) !== "";
}

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function readDir(dir: string, extensions: string[]): Promise<ProfileDocument[]> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((f) => extensions.includes(path.extname(f))).sort();
  } catch {
    return [];
  }
  return Promise.all(
    names.map(async (name) => ({ name, content: await readFile(path.join(dir, name), "utf8") }))
  );
}

export async function profileFilesExist(): Promise<boolean> {
  return (await readIfExists(path.join(PROFILE_DIR, RESUME_NAME))) !== null;
}

// Copies profile/ into the database. Overwrites same-named documents, leaves
// the files in place as a backup.
export async function importProfileFiles(): Promise<{ imported: number }> {
  let imported = 0;

  const resume = await readIfExists(path.join(PROFILE_DIR, RESUME_NAME));
  if (resume !== null) {
    await saveResume(resume);
    imported++;
  }
  const writingStyle = await readIfExists(path.join(PROFILE_DIR, WRITING_STYLE_NAME));
  if (writingStyle !== null) {
    await saveWritingStyle(writingStyle);
    imported++;
  }
  for (const note of await readDir(NOTES_DIR, [".md"])) {
    await upsertDocument("note", note.name, note.content);
    imported++;
  }
  for (const example of await readDir(EXAMPLES_DIR, EXAMPLE_EXTENSIONS)) {
    await upsertDocument("example", example.name, example.content);
    imported++;
  }

  return { imported };
}
