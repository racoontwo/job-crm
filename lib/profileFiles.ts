// Read/write/list/delete for the files under profile/ — this is for the
// Settings page (viewing, editing, uploading, deleting). How these same
// files get assembled into the AI prompt lives in lib/coverLetterGenerator.ts;
// that module only ever reads, never writes.

import { readFile, writeFile, readdir, unlink, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { PROFILE_DIR, NOTES_DIR, EXAMPLES_DIR, EXAMPLE_EXTENSIONS } from "@/lib/profilePaths";

export type ProfileFileInfo = { filename: string; size: number };

async function readFileOrEmpty(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

export async function getResume(): Promise<string> {
  return readFileOrEmpty(path.join(PROFILE_DIR, "resume.md"));
}

export async function saveResume(content: string): Promise<void> {
  await mkdir(PROFILE_DIR, { recursive: true });
  await writeFile(path.join(PROFILE_DIR, "resume.md"), content, "utf8");
}

export async function getWritingStyle(): Promise<string> {
  return readFileOrEmpty(path.join(PROFILE_DIR, "writing-style.md"));
}

export async function saveWritingStyle(content: string): Promise<void> {
  await mkdir(PROFILE_DIR, { recursive: true });
  await writeFile(path.join(PROFILE_DIR, "writing-style.md"), content, "utf8");
}

async function listDir(dir: string, allowedExtensions: string[]): Promise<ProfileFileInfo[]> {
  let filenames: string[];
  try {
    filenames = (await readdir(dir)).filter((f) => allowedExtensions.includes(path.extname(f)));
  } catch {
    return [];
  }
  return Promise.all(
    filenames.sort().map(async (filename) => {
      const stats = await stat(path.join(dir, filename));
      return { filename, size: stats.size };
    })
  );
}

// Only a bare filename is ever accepted — no directory components — so an
// uploaded or deleted filename can never escape its intended folder via
// "../" tricks.
function safeFilename(filename: string): string {
  const base = path.basename(filename);
  if (!base || base !== filename || base === "." || base === "..") {
    throw new Error(`Invalid filename: "${filename}".`);
  }
  return base;
}

export async function listNotes(): Promise<ProfileFileInfo[]> {
  return listDir(NOTES_DIR, [".md"]);
}

export async function saveNote(filename: string, content: string): Promise<void> {
  const safe = safeFilename(filename);
  if (path.extname(safe) !== ".md") {
    throw new Error(`"${filename}" isn't a .md file.`);
  }
  await mkdir(NOTES_DIR, { recursive: true });
  await writeFile(path.join(NOTES_DIR, safe), content, "utf8");
}

export async function deleteNote(filename: string): Promise<void> {
  const safe = safeFilename(filename);
  await unlink(path.join(NOTES_DIR, safe)).catch(() => {});
}

export async function listExamples(): Promise<ProfileFileInfo[]> {
  return listDir(EXAMPLES_DIR, EXAMPLE_EXTENSIONS);
}

export async function saveExample(filename: string, content: string): Promise<void> {
  const safe = safeFilename(filename);
  if (!EXAMPLE_EXTENSIONS.includes(path.extname(safe))) {
    throw new Error(`"${filename}" must be one of: ${EXAMPLE_EXTENSIONS.join(", ")}.`);
  }
  await mkdir(EXAMPLES_DIR, { recursive: true });
  await writeFile(path.join(EXAMPLES_DIR, safe), content, "utf8");
}

export async function deleteExample(filename: string): Promise<void> {
  const safe = safeFilename(filename);
  await unlink(path.join(EXAMPLES_DIR, safe)).catch(() => {});
}
