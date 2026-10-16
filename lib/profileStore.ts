// What the cover-letter generator knows about you, as files in profile/ on
// this laptop (gitignored) — see lib/profilePaths.ts for the folders. Files
// are dropped in on the Settings page or copied in by hand, in any of
// PROFILE_EXTENSIONS' formats; their text is extracted when read, so replacing
// a file is all it takes to update it. Deliberately not in the database.
//
// Free of next/* imports so it's usable anywhere (the generator, scripts).

import { readFile, writeFile, readdir, unlink, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { documentText, looksLike } from "@/lib/documentText";
import {
  MAX_PROFILE_FILE_BYTES,
  PROFILE_EXTENSIONS,
  PROFILE_SECTIONS,
  type ProfileSection,
} from "@/lib/profilePaths";

export type ProfileDocument = { name: string; content: string };

export type ProfileFileInfo = {
  filename: string;
  size: number;
  words: number; // of extracted text; 0 means nothing readable (e.g. a scanned PDF)
  template: boolean; // still the "FILL ME IN" scaffolding
  error?: string; // couldn't be read at all
};

// A file that's still scaffolding would produce a letter built on
// placeholders, so it's skipped rather than sent to the AI. The literal
// marker is checked first because a template's own intro prose is long
// enough to pass the length check on its own.
export function isUnfilledTemplate(text: string): boolean {
  if (text.includes("FILL ME IN")) return true;
  return text.replace(/<!--[\s\S]*?-->/g, "").replace(/^#.*$/gm, "").trim().length < 200;
}

function isTemplateFile(name: string, text: string): boolean {
  // Only text files can be templates; a dropped-in CV that happens to be
  // short is still real material.
  return [".md", ".txt"].includes(path.extname(name).toLowerCase()) && isUnfilledTemplate(text);
}

async function fileNames(section: ProfileSection): Promise<string[]> {
  try {
    return (await readdir(PROFILE_SECTIONS[section].dir))
      .filter((f) => !f.startsWith(".") && PROFILE_EXTENSIONS.includes(path.extname(f).toLowerCase()))
      .sort();
  } catch {
    return []; // folder doesn't exist yet
  }
}

// Only a bare filename with an allowed extension is accepted, so an uploaded
// or deleted name can never escape its folder via "../".
function safeFilename(filename: string): string {
  const base = path.basename(filename);
  if (!base || base !== filename || base.startsWith(".")) {
    throw new Error(`Invalid filename: "${filename}".`);
  }
  if (!PROFILE_EXTENSIONS.includes(path.extname(base).toLowerCase())) {
    throw new Error(`"${filename}" isn't supported — use ${PROFILE_EXTENSIONS.join(", ")}.`);
  }
  return base;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

export async function listProfileFiles(section: ProfileSection): Promise<ProfileFileInfo[]> {
  const dir = PROFILE_SECTIONS[section].dir;
  return Promise.all(
    (await fileNames(section)).map(async (filename) => {
      const filePath = path.join(dir, filename);
      const { size } = await stat(filePath);
      try {
        const text = await documentText(filename, await readFile(filePath));
        return { filename, size, words: wordCount(text), template: isTemplateFile(filename, text) };
      } catch {
        return { filename, size, words: 0, template: false, error: "Couldn't read this file." };
      }
    })
  );
}

export async function saveProfileFile(section: ProfileSection, filename: string, bytes: Buffer) {
  const name = safeFilename(filename);
  if (bytes.length === 0) throw new Error(`"${name}" is empty.`);
  if (bytes.length > MAX_PROFILE_FILE_BYTES) {
    throw new Error(`"${name}" is over ${MAX_PROFILE_FILE_BYTES / 1024 / 1024} MB.`);
  }
  if (!looksLike(name, bytes)) {
    throw new Error(`"${name}" doesn't look like a ${path.extname(name)} file.`);
  }
  const dir = PROFILE_SECTIONS[section].dir;
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), bytes);
}

export async function deleteProfileFile(section: ProfileSection, filename: string) {
  await unlink(path.join(PROFILE_SECTIONS[section].dir, safeFilename(filename))).catch(() => {});
}

// ---------------------------------------------------------------------------
// Cover-letter generator
// ---------------------------------------------------------------------------

// The extracted text of every usable file in a section: unreadable, empty
// and unfilled-template files are left out.
export async function readProfileSection(section: ProfileSection): Promise<ProfileDocument[]> {
  const dir = PROFILE_SECTIONS[section].dir;
  const docs = await Promise.all(
    (await fileNames(section)).map(async (name) => {
      try {
        const content = await documentText(name, await readFile(path.join(dir, name)));
        return { name, content };
      } catch {
        return { name, content: "" };
      }
    })
  );
  return docs.filter((d) => d.content.trim() && !isTemplateFile(d.name, d.content));
}
