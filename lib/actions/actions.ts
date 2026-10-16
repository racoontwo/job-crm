"use server";

import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import { applications, followUps } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { extractJobPostingFromUrl, type ExtractedJobPosting } from "@/lib/jobPosting";
import { getMongoStatus, type DatabaseStatus } from "@/lib/db/mongoStatus";
import { after } from "next/server";
import { setCoverLetter } from "@/lib/db/coverLetters";
import {
  createDraft,
  deleteDraftsForApplication,
  getDraft,
  listDrafts,
  type CoverLetterDraft,
  type GeneratorProvider,
} from "@/lib/db/coverLetterDrafts";
import { runDraft } from "@/lib/coverLetterPipeline";
import { deleteProfileFile, listProfileFiles, saveProfileFile } from "@/lib/profileStore";
import { isProfileSection } from "@/lib/profilePaths";
import { applicationsCollection, type FollowUpDoc } from "@/lib/db/mongoCollections";
import { markSavedLinkDone } from "@/lib/actions/savedLinks";
import * as data from "@/lib/db/applications";
import { cleanJobUrl, jobUrlKey } from "@/lib/jobUrl";
import { readPosting } from "@/lib/coverLetterGenerator";
import { firstUrl, kindOfApplication, sourceForKind, type PostingKind } from "@/lib/postingKind";
import { inferSourceLabel } from "@/lib/jobSources";

const today = data.today;

export async function getDatabaseStatus(): Promise<DatabaseStatus> {
  return getMongoStatus();
}

export async function extractJobPosting(url: string): Promise<ExtractedJobPosting> {
  return extractJobPostingFromUrl(url);
}

// ---------------------------------------------------------------------------
// Reads (lib/db/applications.ts)
// ---------------------------------------------------------------------------

export async function getCompanyNames() {
  return data.getCompanyNames();
}

export async function getDashboardData() {
  return data.getDashboardData();
}

export async function getApplication(id: string) {
  return data.getApplication(id);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createCompanyAndApplication(formData: FormData) {
  const companyName = (formData.get("companyName") as string)?.trim();
  const website = (formData.get("website") as string)?.trim() || null;
  const industry = (formData.get("industry") as string)?.trim() || null;
  const interestLevel = Number(formData.get("interestLevel") || 3);
  const roleTitle = (formData.get("roleTitle") as string)?.trim();
  const roleDescription = (formData.get("roleDescription") as string)?.trim() || null;
  const source = (formData.get("source") as string)?.trim() || null;
  const rawJobUrl = (formData.get("jobUrl") as string)?.trim();
  const jobUrl = rawJobUrl ? cleanJobUrl(rawJobUrl) : null;
  const savedLinkId = (formData.get("savedLinkId") as string)?.trim() || null;

  if (!companyName || !roleTitle) {
    throw new Error("Company name and role title are required.");
  }

  const input: data.NewApplicationInput = {
    companyName,
    website,
    industry,
    interestLevel,
    roleTitle,
    roleDescription,
    source,
    jobUrl,
  };

  const appId = await data.createApplication(input);

  await markSavedLinkDone(appId, { savedLinkId, jobUrl });

  revalidatePath("/");
  redirect(`/applications/${appId}?step=cover-letter#cover-letter`);
}

export async function addStatusEvent(formData: FormData) {
  const applicationId = (formData.get("applicationId") as string)?.trim();
  const status = (formData.get("status") as string)?.trim();
  const note = (formData.get("note") as string)?.trim() || null;
  const eventDate = (formData.get("eventDate") as string) || today();

  if (!applicationId || !status) throw new Error("Missing status event fields.");

  await data.recordStatusEvent(applicationId, status, note, eventDate);

  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/");
}

export async function addFollowUp(formData: FormData) {
  const applicationId = (formData.get("applicationId") as string)?.trim();
  const dueDate = formData.get("dueDate") as string;
  const note = (formData.get("note") as string)?.trim() || null;

  if (!applicationId || !dueDate) throw new Error("Missing follow-up fields.");

  const dbStatus = await getMongoStatus();
  if (dbStatus.connected) {
    const appsCol = await applicationsCollection();
    const followUp: FollowUpDoc = {
      _id: new ObjectId(),
      dueDate,
      note,
      done: false,
      createdAt: new Date().toISOString(),
    };
    await appsCol.updateOne(
      { _id: new ObjectId(applicationId) },
      { $push: { followUps: followUp } }
    );
  } else {
    const numericId = Number(applicationId);
    await db.insert(followUps).values({ applicationId: numericId, dueDate, note });
  }

  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/");
}

// Queues a draft and returns straight away; the AI runs after the response
// (lib/coverLetterPipeline.ts). The page polls listCoverLetterDrafts.
export async function generateCoverLetter(
  applicationId: string,
  provider: GeneratorProvider = "claude"
) {
  if (!applicationId) throw new Error("Missing application id.");

  const draftId = await createDraft(applicationId, provider);
  after(() => runDraft(draftId));

  revalidatePath(`/applications/${applicationId}`);
}

// The main page's paste box: a posting (its text, or just a link to a page
// the app can read) → saved as "To apply" → a letter queued straight away,
// formal or a short proposal depending on the kind. Redirects to the
// application, where the letter appears when it's done.
export type PasteResult = { error?: string; existing?: { id: string; label: string } };

// Below this much text besides the link, the paste is treated as just a link.
const MIN_POSTING_CHARS = 200;

export async function writeLetterFromPaste(
  _prev: PasteResult,
  formData: FormData
): Promise<PasteResult> {
  const text = ((formData.get("posting") as string) ?? "").trim();
  const kindChoice = formData.get("kind") as PostingKind | "auto";
  const provider: GeneratorProvider = formData.get("provider") === "gemini" ? "gemini" : "claude";
  if (!text) return { error: "Paste a job posting first." };

  const rawUrl = firstUrl(text);
  const jobUrl = rawUrl ? cleanJobUrl(rawUrl) : null;
  const textBesidesLink = rawUrl ? text.replace(rawUrl, "").trim() : text;

  if (jobUrl) {
    const key = jobUrlKey(jobUrl);
    const existing = (await data.getDashboardData()).find((a) => a.jobUrl && jobUrlKey(a.jobUrl) === key);
    if (existing) {
      return {
        error: "You've already saved this job.",
        existing: { id: existing.id, label: `${existing.company.name} – ${existing.roleTitle}` },
      };
    }
  }

  let input: data.NewApplicationInput;
  let detectedKind: PostingKind;
  try {
    if (textBesidesLink.length < MIN_POSTING_CHARS) {
      if (!jobUrl) return { error: "That's too short to be a job posting — paste the whole posting." };
      const posting = await extractJobPostingFromUrl(jobUrl);
      if (posting.error || !posting.roleDescription.trim()) {
        return {
          error: `${posting.error ?? "Couldn't find the job description on that page."} Copy the posting's text from your browser and paste it here instead (keep the link in, so it's saved too).`,
        };
      }
      detectedKind = kindOfApplication({ source: posting.source, jobUrl });
      input = {
        companyName: posting.companyName.trim() || "Unknown company",
        website: posting.companyWebsite || null,
        industry: posting.industry || null,
        interestLevel: 3,
        roleTitle: posting.roleTitle.trim() || "Untitled role",
        roleDescription: posting.roleDescription,
        source: posting.source || null,
        jobUrl,
      };
    } else {
      const facts = await readPosting(text, provider);
      detectedKind = facts.kind;
      input = {
        companyName: facts.companyName ?? (facts.kind === "freelance" ? "Freelance client" : "Unknown company"),
        website: null,
        industry: null,
        interestLevel: 3,
        roleTitle: facts.roleTitle ?? "Untitled role",
        roleDescription: textBesidesLink || text,
        source: facts.platform ?? (jobUrl ? inferSourceLabel(new URL(jobUrl).hostname) : null),
        jobUrl,
      };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  const kind = kindChoice === "job" || kindChoice === "freelance" ? kindChoice : detectedKind;
  input.source = sourceForKind(kind, input.source);

  const appId = await data.createApplication(input);
  if (jobUrl) await markSavedLinkDone(appId, { savedLinkId: null, jobUrl });
  const draftId = await createDraft(appId, provider);
  after(() => runDraft(draftId));

  revalidatePath("/");
  redirect(`/applications/${appId}?step=cover-letter#cover-letter`);
}

export async function listCoverLetterDrafts(applicationId: string): Promise<CoverLetterDraft[]> {
  return listDrafts(applicationId);
}

// "Use this version" on a draft: makes it the application's cover letter.
export async function applyCoverLetterDraft(formData: FormData) {
  const draftId = (formData.get("draftId") as string)?.trim();
  const draft = draftId ? await getDraft(draftId) : null;
  if (!draft?.letter) throw new Error("That draft has no letter to use.");

  await setCoverLetter(draft.applicationId, draft.letter);
  revalidatePath(`/applications/${draft.applicationId}`);
}

export async function saveCoverLetter(formData: FormData) {
  const applicationId = (formData.get("applicationId") as string)?.trim();
  const text = ((formData.get("coverLetter") as string) ?? "").trim();

  if (!applicationId) throw new Error("Missing application id.");

  const { updated } = await setCoverLetter(applicationId, text || null);
  if (!updated) throw new Error("Couldn't find that application to save to.");

  revalidatePath(`/applications/${applicationId}`);
}

export async function toggleFollowUpDone(followUpId: string, applicationId: string, done: boolean) {
  const status = await getMongoStatus();
  if (status.connected) {
    const appsCol = await applicationsCollection();
    await appsCol.updateOne(
      { _id: new ObjectId(applicationId), "followUps._id": new ObjectId(followUpId) },
      { $set: { "followUps.$.done": done } }
    );
  } else {
    await db.update(followUps).set({ done }).where(eq(followUps.id, Number(followUpId)));
  }

  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/");
}

export async function deleteApplication(applicationId: string) {
  const status = await getMongoStatus();
  if (status.connected) {
    const appsCol = await applicationsCollection();
    await appsCol.deleteOne({ _id: new ObjectId(applicationId) });
    await deleteDraftsForApplication(applicationId);
  } else {
    await db.delete(applications).where(eq(applications.id, Number(applicationId)));
  }
  revalidatePath("/");
  redirect("/");
}

// ---------------------------------------------------------------------------
// Settings — the files in profile/ the cover-letter generator reads (see
// lib/coverLetterGenerator.ts, lib/profileStore.ts).

export async function getProfileSettings() {
  const [about, style, examples] = await Promise.all([
    listProfileFiles("about"),
    listProfileFiles("style"),
    listProfileFiles("examples"),
  ]);
  return { about, style, examples };
}

// One file per call (the drop zone sends them one at a time), so the body
// limit in next.config.ts applies per file. Returns the problem instead of
// throwing, for the drop zone to show next to the file.
export async function uploadProfileFileAction(
  formData: FormData
): Promise<{ error?: string }> {
  const section = formData.get("section");
  const file = formData.get("file");
  if (!isProfileSection(section) || !(file instanceof File)) return { error: "Nothing to upload." };
  try {
    await saveProfileFile(section, file.name, Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath("/settings");
  return {};
}

export async function deleteProfileFileAction(formData: FormData) {
  const section = formData.get("section");
  const filename = formData.get("filename");
  if (isProfileSection(section) && typeof filename === "string" && filename) {
    await deleteProfileFile(section, filename);
  }
  revalidatePath("/settings");
}
