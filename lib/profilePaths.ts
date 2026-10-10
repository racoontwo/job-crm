// Where your profile lives: profile/ on this laptop (gitignored), one folder
// per kind of source material. Files are dropped in on the Settings page or
// copied in by hand; lib/profileStore.ts reads them.
import path from "node:path";

export const PROFILE_DIR = path.join(process.cwd(), "profile");

export type ProfileSection = "about" | "style" | "examples";

export const PROFILE_SECTIONS: Record<ProfileSection, { dir: string; folder: string }> = {
  // CV, LinkedIn export, notes — everything the letter may draw facts from.
  about: { dir: path.join(PROFILE_DIR, "about"), folder: "profile/about/" },
  // Rules for how letters should read: language, tone, length, signature.
  style: { dir: path.join(PROFILE_DIR, "style"), folder: "profile/style/" },
  // Past cover letters, one per file.
  examples: { dir: path.join(PROFILE_DIR, "examples"), folder: "profile/examples/" },
};

export const PROFILE_EXTENSIONS = [".pdf", ".docx", ".md", ".txt"];

// Per file. next.config.ts raises the server action body limit to match.
export const MAX_PROFILE_FILE_BYTES = 10 * 1024 * 1024;

export function isProfileSection(value: unknown): value is ProfileSection {
  return value === "about" || value === "style" || value === "examples";
}
