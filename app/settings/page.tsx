import { getProfileSettings } from "@/lib/actions/actions";
import { PROFILE_SECTIONS } from "@/lib/profilePaths";
import ProfileDropZone from "@/components/ProfileDropZone";

export default async function SettingsPage() {
  const { about, style, examples } = await getProfileSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-neutral-600">
          The source material the cover-letter generator reads. Dropped files are saved in the{" "}
          <code>profile/</code> folder on this laptop (kept out of git) — you can also copy files
          into those folders yourself.
        </p>
      </div>

      <ProfileDropZone
        section="about"
        title="About you"
        folder={PROFILE_SECTIONS.about.folder}
        description="your CV, LinkedIn profile (Save to PDF), notes. Letters only use facts found in these files. Required."
        files={about}
      />
      <ProfileDropZone
        section="style"
        title="Writing style"
        folder={PROFILE_SECTIONS.style.folder}
        description="rules for how your letters should read: language, tone, length, phrases to avoid, signature. Optional — without it letters are short, plain and in the posting's language."
        files={style}
      />
      <ProfileDropZone
        section="examples"
        title="Example cover letters"
        folder={PROFILE_SECTIONS.examples.folder}
        description="letters you've written before, one per file (up to 6 used). Optional; combined with letters you save in this app."
        files={examples}
      />
    </div>
  );
}
