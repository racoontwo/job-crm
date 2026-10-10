// Where your profile lives: profile/ on this laptop (gitignored), read and
// written by lib/profileStore.ts.
import path from "node:path";

export const PROFILE_DIR = path.join(process.cwd(), "profile");
export const NOTES_DIR = path.join(PROFILE_DIR, "notes");
export const EXAMPLES_DIR = path.join(PROFILE_DIR, "examples");
export const EXAMPLE_EXTENSIONS = [".md", ".txt"];
