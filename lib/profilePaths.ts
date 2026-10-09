// Where the old profile/ files live. Only read by importProfileFiles() in
// lib/profileStore.ts, which copies them into the database once — the
// profile itself is stored in the database now.
import path from "node:path";

export const PROFILE_DIR = path.join(process.cwd(), "profile");
export const NOTES_DIR = path.join(PROFILE_DIR, "notes");
export const EXAMPLES_DIR = path.join(PROFILE_DIR, "examples");
export const EXAMPLE_EXTENSIONS = [".md", ".txt"];
