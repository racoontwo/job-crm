// Shared by lib/coverLetterGenerator.ts (reads these for the AI prompt) and
// lib/profileFiles.ts (CRUD for the Settings page) — one source of truth so
// the two never drift apart on where these files live.
import path from "node:path";

export const PROFILE_DIR = path.join(process.cwd(), "profile");
export const NOTES_DIR = path.join(PROFILE_DIR, "notes");
export const EXAMPLES_DIR = path.join(PROFILE_DIR, "examples");
export const EXAMPLE_EXTENSIONS = [".md", ".txt"];
