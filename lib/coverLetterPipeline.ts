// Step 3 of adding a job: turn a saved application into a cover letter.
//
//   saved application ─┐
//   your profile ──────┼─ buildPrompt ─ AI provider ─ draft (history)
//   approved letters ──┘                                 └─ application's letter, if it had none
//
// generateCoverLetter (lib/actions/actions.ts) creates a queued draft and
// runs runDraft() after the response via next/server's after(), so the page
// doesn't wait on the AI and the draft survives navigating away.

import { buildPrompt, draftWithClaudeCli, draftWithGemini, readProfile, readProfileExamples } from "@/lib/coverLetterGenerator";
import { getCoverLetterContext, getCoverLetterExamples, setCoverLetter } from "@/lib/db/coverLetters";
import { getDraft, updateDraft } from "@/lib/db/coverLetterDrafts";

function now() {
  return new Date().toISOString();
}

export async function runDraft(draftId: string): Promise<void> {
  const draft = await getDraft(draftId);
  if (!draft || draft.status !== "queued") return;

  await updateDraft(draftId, { status: "generating", startedAt: now() });

  try {
    // 1. The job
    const context = await getCoverLetterContext(draft.applicationId);
    if (!context) throw new Error("Couldn't find that application.");

    // 2. About you
    const profileResult = await readProfile();
    if (!profileResult.ok) throw new Error(profileResult.problems.join(" "));

    // 3. How you write: uploaded examples + letters saved on other applications
    const [profileExamples, savedLetters] = await Promise.all([
      readProfileExamples(),
      getCoverLetterExamples(draft.applicationId),
    ]);
    const examples = [...profileExamples, ...savedLetters];

    // 4. Prompt — stored on the draft so drafts can be compared later
    const prompt = buildPrompt(context, profileResult.profile, examples);
    await updateDraft(draftId, { prompt, exampleCount: examples.length });

    // 5. AI
    const result =
      draft.provider === "claude" ? await draftWithClaudeCli(prompt) : await draftWithGemini(prompt);

    // 6. Save. Only fills the application's letter if it's empty, so a letter
    // you've edited is never replaced — pick a draft with "Use this version".
    await updateDraft(draftId, {
      status: "ready",
      letter: result.text,
      model: result.model,
      finishedAt: now(),
    });
    if (!context.coverLetter?.trim()) {
      await setCoverLetter(draft.applicationId, result.text);
    }
  } catch (err) {
    await updateDraft(draftId, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      finishedAt: now(),
    });
  }
}
