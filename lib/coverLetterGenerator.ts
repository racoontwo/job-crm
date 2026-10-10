// Cover letter drafting — two selectable providers: the Gemini API, or the
// local `claude` CLI run headlessly.
//
// Both are stateless — neither reads this app's database or filesystem on
// its own. Everything either "knows" is assembled here into one prompt: the
// target job (from the DB), the user's background and rules (the files in
// profile/, lib/profileStore.ts), and past letters they approved (the
// few-shot memory, lib/db/coverLetters.ts). The pipeline that runs this per
// draft lives in lib/coverLetterPipeline.ts.
//
// Gemini API shape below was verified against @google/genai's own type
// definitions, not the published docs — the docs describe an `output_text`
// convenience property and model ids this SDK version doesn't have.

import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import type { CoverLetterContext, CoverLetterExample } from "@/lib/db/coverLetters";
import { readProfileSection, type ProfileDocument } from "@/lib/profileStore";

const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_FILE_EXAMPLES = 6;
const CLAUDE_CLI_TIMEOUT_MS = 120_000;

export type Profile = { resume: string; writingStyle: string };

// Without rules of their own, letters still need some.
const DEFAULT_WRITING_RULES = `- Write in the language of the job posting.
- Keep it under 300 words, in 3–4 short paragraphs.
- Plain, direct, confident tone; no clichés or filler.`;

// Reads the profile/ folders (lib/profileStore.ts). Background is required;
// writing rules are optional. Unfilled templates and unreadable files are
// already left out by readProfileSection.
export async function readProfile(): Promise<
  { ok: true; profile: Profile } | { ok: false; problems: string[] }
> {
  const [about, style] = await Promise.all([readProfileSection("about"), readProfileSection("style")]);
  if (about.length === 0) {
    return {
      ok: false,
      problems: [
        "There's nothing about you to write from yet — drop your CV (or other background) into \"About you\" on the Settings page.",
      ],
    };
  }
  return {
    ok: true,
    profile: {
      resume: renderDocuments(about),
      writingStyle: style.length > 0 ? renderDocuments(style) : DEFAULT_WRITING_RULES,
    },
  };
}

// One heading per file, so the AI can tell a CV from a note.
function renderDocuments(docs: ProfileDocument[]): string {
  if (docs.length === 1) return docs[0].content.trim();
  return docs
    .map((d) => `### ${d.name}\n\n${d.content.trim()}`)
    .join("\n\n");
}

// Optional past cover letters uploaded on the Settings page, combined with
// the letters saved on applications (lib/db/coverLetters.ts). The whole
// document is the letter as-is; no required metadata.
export async function readProfileExamples(): Promise<CoverLetterExample[]> {
  const docs = await readProfileSection("examples");
  return docs
    .slice(0, MAX_FILE_EXAMPLES)
    .map((doc) => doc.content.trim())
    .filter((letter) => letter.length > 0)
    .map((letter) => ({
      companyName: null,
      industry: null,
      roleTitle: null,
      roleDescriptionExcerpt: null,
      letter,
    }));
}

function renderExamples(examples: CoverLetterExample[]): string {
  if (examples.length === 0) {
    return "(No previous letters yet — this is the first one.)";
  }

  return examples
    .map((example, i) => {
      const job = [
        example.roleTitle ? `Role: ${example.roleTitle}` : null,
        example.companyName ? `Company: ${example.companyName}` : null,
        example.industry ? `Industry: ${example.industry}` : null,
        example.roleDescriptionExcerpt
          ? `Posting: ${example.roleDescriptionExcerpt}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");

      const jobBlock = job ? `${job}\n\n` : "";
      return `--- Example ${i + 1} ---\n${jobBlock}Letter the user approved:\n${example.letter}`;
    })
    .join("\n\n");
}

export function buildPrompt(
  context: CoverLetterContext,
  profile: Profile,
  examples: CoverLetterExample[]
): string {
  const targetJob = [
    `Role: ${context.roleTitle}`,
    `Company: ${context.company.name}`,
    context.company.industry ? `Industry: ${context.company.industry}` : null,
    context.company.notes ? `Notes about the company: ${context.company.notes}` : null,
    context.roleDescription ? `Job posting:\n${context.roleDescription}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `You are drafting a cover letter on behalf of the person described below. Write it in their voice, as if they wrote it themselves.

Read the job posting carefully and pick out which of their actual skills and experience are most relevant to this specific role. Be specific and selective rather than listing everything.

HARD RULES — these override everything else, including any pattern you notice in the past examples:

${profile.writingStyle}

THE PERSON'S BACKGROUND — you may only use facts that appear here. Do not invent employers, job titles, dates, metrics, technologies, or qualifications. If the posting asks for something their background doesn't cover, either leave it out or address it honestly; never fabricate it.

${profile.resume}

PAST LETTERS THIS PERSON APPROVED — match their structure, rhythm, and voice. These reflect how they actually want letters written, since they edited and saved them.

${renderExamples(examples)}

THE JOB TO WRITE FOR NOW:

${targetJob}

Output only the cover letter itself — no preamble, no commentary, no subject line, no markdown formatting.`;
}

export type ProviderResult = { text: string; model: string };

export async function draftWithGemini(prompt: string): Promise<ProviderResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY isn't set. Add it to .env.local (get a key at https://aistudio.google.com/apikey) and restart the dev server."
    );
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey });
  const interaction = await ai.interactions.create({ model, input: prompt });

  const text = (interaction.outputs ?? [])
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();

  if (!text) {
    throw new Error(
      `Gemini returned no text (interaction status: ${interaction.status}). Try again, or check your API quota.`
    );
  }

  return { text, model };
}

// Alternative provider: the already-installed `claude` CLI, run headless
// (-p/"print" mode) as a pure text-completion subprocess. It gets the exact
// same assembled prompt Gemini receives above — it is deliberately NOT given
// its own file-read access (cwd is a neutral scratch dir, not this repo), so
// there's no tool-use/permission complexity and no risk of it picking up
// this repo's own AGENTS.md into an unrelated prompt.
//
// KNOWN ISSUE (anthropics/claude-code#7263, reported Linux-specific — this
// app targets macOS, so it likely won't reproduce, but watch for it during
// manual testing): `claude -p` has been reported to return empty stdout for
// piped stdin above ~7000 chars, which this prompt will usually exceed. If
// reproduced, switch to passing the prompt as the final CLI arg instead —
// Node's spawn with an args array never goes through a shell, so there's no
// escaping/injection concern either way:
//   spawn("claude", ["-p", "--output-format", "text", prompt], { ... })
//
// Resolution deliberately does not rely on bare `"claude"` + PATH: the
// process running this app (e.g. launched from an editor/extension) can have
// a different, narrower PATH than an interactive terminal, so `claude` being
// found by typing it in Terminal doesn't mean this process can find it too.
// Check CLAUDE_CLI_PATH, then the native installer's fixed location, then
// common package-manager locations, before falling back to PATH resolution.
function resolveClaudeBinary(): string {
  const candidates = [
    process.env.CLAUDE_CLI_PATH,
    path.join(os.homedir(), ".local", "bin", "claude"), // native installer (curl | bash)
    "/opt/homebrew/bin/claude", // Homebrew, Apple Silicon
    "/usr/local/bin/claude", // Homebrew, Intel
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return "claude"; // last resort: hope it's on this process's PATH
}

function runClaudeCli(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const claudeBinary = resolveClaudeBinary();
    console.log(`[cover letter] running \`${claudeBinary} -p\` (prompt: ${prompt.length} chars)...`);

    const child = spawn(
      claudeBinary,
      ["-p", "--output-format", "text"],
      {
        cwd: os.tmpdir(),
        timeout: CLAUDE_CLI_TIMEOUT_MS,
        killSignal: "SIGTERM",
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";

    // Mirror to this process's own stdout/stderr so the `claude` invocation
    // is visible in whatever terminal is running `npm run dev`, in addition
    // to capturing it here to return as the letter text. Note: `-p
    // --output-format text` prints the full response once, not token by
    // token — this shows the call happening and its full output, not a
    // live-typing effect.
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    // Swallow EPIPE if the child exits before we finish writing to stdin;
    // the 'error'/'close' handlers below already surface the real failure.
    child.stdin.on("error", () => {});

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `Couldn't find the \`claude\` CLI at "${claudeBinary}" or common install locations. ` +
              "If it's installed somewhere else, set CLAUDE_CLI_PATH in .env.local to its full path and restart the dev server."
          )
        );
      } else {
        reject(new Error(`Couldn't start the \`claude\` CLI: ${err.message}`));
      }
    });

    child.on("close", (code, signal) => {
      if (signal) {
        reject(
          new Error(
            `The \`claude\` CLI timed out after ${CLAUDE_CLI_TIMEOUT_MS / 1000}s. Try again, or run \`claude /status\` to check you're logged in.`
          )
        );
        return;
      }
      if (code !== 0) {
        reject(
          new Error(`The \`claude\` CLI exited with code ${code}: ${stderr.trim() || "(no error output)"}`)
        );
        return;
      }
      resolve(stdout.trim());
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

export async function draftWithClaudeCli(prompt: string): Promise<ProviderResult> {
  const text = await runClaudeCli(prompt);

  if (!text) {
    throw new Error(
      "The `claude` CLI returned no text. This can happen with very large prompts (see the known-issue note above runClaudeCli) — try again, or check `claude /status`."
    );
  }

  // `-p` uses whatever model the CLI is configured with; it isn't reported back.
  return { text, model: "claude CLI (default model)" };
}
