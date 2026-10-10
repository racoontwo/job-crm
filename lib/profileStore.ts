// What the cover-letter generator knows about you — resume, writing rules,
// extra notes, past letters — as files in profile/ on this laptop
// (gitignored). Edit them in your editor or on the Settings page; both read
// and write the same files. Deliberately not in the database.
//
// Free of next/* imports so it's usable anywhere (the generator, scripts).

import { readFile, writeFile, readdir, unlink, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { PROFILE_DIR, NOTES_DIR, EXAMPLES_DIR, EXAMPLE_EXTENSIONS } from "@/lib/profilePaths";

export type ProfileFileInfo = { filename: string; size: number };
export type ProfileDocument = { name: string; content: string };

const RESUME_PATH = path.join(PROFILE_DIR, "resume.md");
const WRITING_STYLE_PATH = path.join(PROFILE_DIR, "writing-style.md");

async function readFileOrEmpty(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function writeInDir(dir: string, filename: string, content: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), content, "utf8");
}

async function listNames(dir: string, extensions: string[]): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => extensions.includes(path.extname(f))).sort();
  } catch {
    return []; // folder doesn't exist yet — it's optional
  }
}

async function listInfo(dir: string, extensions: string[]): Promise<ProfileFileInfo[]> {
  const names = await listNames(dir, extensions);
  return Promise.all(
    names.map(async (filename) => ({ filename, size: (await stat(path.join(dir, filename))).size }))
  );
}

async function readAll(dir: string, extensions: string[]): Promise<ProfileDocument[]> {
  const names = await listNames(dir, extensions);
  return Promise.all(
    names.map(async (name) => ({ name, content: await readFile(path.join(dir, name), "utf8") }))
  );
}

// Only a bare filename with an expected extension is accepted, so an uploaded
// or deleted name can never escape its folder via "../".
function safeFilename(filename: string, extensions: string[]): string {
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
// Settings page
// ---------------------------------------------------------------------------

export const getResume = () => readFileOrEmpty(RESUME_PATH);
export const saveResume = (content: string) => writeInDir(PROFILE_DIR, "resume.md", content);
export const getWritingStyle = () => readFileOrEmpty(WRITING_STYLE_PATH);
export const saveWritingStyle = (content: string) =>
  writeInDir(PROFILE_DIR, "writing-style.md", content);

export const listNotes = () => listInfo(NOTES_DIR, [".md"]);
export const saveNote = (filename: string, content: string) =>
  writeInDir(NOTES_DIR, safeFilename(filename, [".md"]), content);
export const deleteNote = (filename: string) =>
  unlink(path.join(NOTES_DIR, safeFilename(filename, [".md"]))).catch(() => {});

export const listExamples = () => listInfo(EXAMPLES_DIR, EXAMPLE_EXTENSIONS);
export const saveExample = (filename: string, content: string) =>
  writeInDir(EXAMPLES_DIR, safeFilename(filename, EXAMPLE_EXTENSIONS), content);
export const deleteExample = (filename: string) =>
  unlink(path.join(EXAMPLES_DIR, safeFilename(filename, EXAMPLE_EXTENSIONS))).catch(() => {});

// ---------------------------------------------------------------------------
// Cover-letter generator
// ---------------------------------------------------------------------------

export const getNoteDocuments = () => readAll(NOTES_DIR, [".md"]);
export const getExampleDocuments = () => readAll(EXAMPLES_DIR, EXAMPLE_EXTENSIONS);
