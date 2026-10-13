// Job CRM as an MCP server, for Claude Desktop on this laptop.
//
// Claude reads job postings in your own browser (so sites that block the
// app's scraper don't matter), writes cover letters from the files in your
// Claude Project, and uses these tools to keep the tracker up to date:
//
//   list_inbox ─ links shared from the phone, waiting
//   save_application ─ a job Claude has read → "To apply" (clears its inbox link)
//   save_cover_letter ─ a letter Claude wrote → the application's draft history
//   list_applications / get_application / update_status / dismiss_inbox_links
//
// Runs over stdio (Claude Desktop starts it via mcp/run.sh) — it opens no
// network port. Same database as the app: Atlas when MONGODB_URI is set in
// .env.local, the local SQLite file otherwise. Nothing may be written to
// stdout except the protocol, so diagnostics go to stderr.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { STATUS_STAGES } from "@/lib/db/schema";
import {
  createApplication,
  getApplication,
  getDashboardData,
  recordStatusEvent,
  today,
} from "@/lib/db/applications";
import { dismissSavedLinks, getNewSavedLinks, markSavedLinkDone } from "@/lib/db/savedLinks";
import { listDrafts, saveWrittenDraft } from "@/lib/db/coverLetterDrafts";
import { setCoverLetter } from "@/lib/db/coverLetters";
import { cleanJobUrl, jobUrlKey } from "@/lib/jobUrl";
import { inferSourceLabel } from "@/lib/jobSources";

const APP_ORIGIN = process.env.JOB_CRM_APP_URL || "http://localhost:3000";

const appLink = (id: string) => `${APP_ORIGIN}/applications/${id}`;

function reply(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function sourceFor(jobUrl: string | null): string | null {
  if (!jobUrl) return null;
  try {
    return inferSourceLabel(new URL(jobUrl).hostname);
  } catch {
    return null;
  }
}

const server = new McpServer({ name: "job-crm", version: "1.0.0" });

server.registerTool(
  "list_inbox",
  {
    title: "List inbox",
    description:
      "Job links shared from the phone that haven't been handled yet, newest first. Each needs reading (open the URL in the browser), then save_application — or dismiss_inbox_links if it's not worth applying to. The same job shared twice shows up as two links with the same url.",
    annotations: { readOnlyHint: true },
  },
  async () => {
    const links = await getNewSavedLinks();
    if (links.length === 0) return reply("The inbox is empty.");
    return reply(links);
  }
);

server.registerTool(
  "dismiss_inbox_links",
  {
    title: "Dismiss inbox links",
    description: "Removes links from the inbox without saving a job (e.g. not relevant, or expired).",
    inputSchema: { ids: z.array(z.string()).min(1).describe("Inbox link ids from list_inbox") },
    annotations: { destructiveHint: false, idempotentHint: true },
  },
  async ({ ids }) => {
    await dismissSavedLinks(ids);
    return reply(`Dismissed ${ids.length} link(s).`);
  }
);

server.registerTool(
  "list_applications",
  {
    title: "List applications",
    description:
      "Jobs in the tracker with company, role, status and whether a cover letter is saved. Optionally only one status.",
    inputSchema: {
      status: z.enum(STATUS_STAGES).optional().describe("Only applications currently in this status"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ status }) => {
    const apps = await getDashboardData();
    return reply(
      apps
        .filter((a) => !status || a.currentStatus === status)
        .map((a) => ({
          id: a.id,
          company: a.company.name,
          role: a.roleTitle,
          status: a.currentStatus,
          appliedDate: a.appliedDate,
          jobUrl: a.jobUrl,
          hasCoverLetter: Boolean(a.coverLetter?.trim()),
          daysSinceUpdate: a.daysSinceUpdate,
        }))
    );
  }
);

server.registerTool(
  "get_application",
  {
    title: "Get application",
    description:
      "Everything about one job: company, role description, saved cover letter, status history, follow-ups and cover letter drafts.",
    inputSchema: { id: z.string().describe("Application id") },
    annotations: { readOnlyHint: true },
  },
  async ({ id }) => {
    const app = await getApplication(id);
    if (!app) return fail(`No application with id ${id}.`);
    const drafts = await listDrafts(id);
    return reply({
      ...app,
      link: appLink(id),
      drafts: drafts.map((d) => ({
        id: d.id,
        status: d.status,
        provider: d.provider,
        createdAt: d.createdAt,
        letter: d.letter,
      })),
    });
  }
);

server.registerTool(
  "save_application",
  {
    title: "Save application",
    description:
      'Saves a job you have read as "To apply" and clears its link from the inbox. Copy the role description from the posting faithfully (it is what cover letters are written from) — do not summarise or invent. Refuses if the same job URL is already saved, unless allowDuplicate is true.',
    inputSchema: {
      companyName: z.string().trim().min(1).describe('Hiring company. Use "Upwork client" (or similar) when the posting hides it.'),
      roleTitle: z.string().trim().min(1),
      roleDescription: z.string().trim().min(1).describe("The posting's description, requirements and conditions, as written"),
      jobUrl: z.string().url().optional().describe("The posting's URL (tracking parameters are removed)"),
      inboxLinkId: z.string().optional().describe("The list_inbox id this job came from, if any"),
      source: z.string().optional().describe("Defaults to the job board, from the URL"),
      companyWebsite: z.string().url().optional(),
      industry: z.string().optional(),
      interestLevel: z.number().int().min(1).max(5).optional().describe("1–5; only ask if the user said. Default 3"),
      allowDuplicate: z.boolean().optional(),
    },
  },
  async (input) => {
    const jobUrl = input.jobUrl ? cleanJobUrl(input.jobUrl) : null;

    if (jobUrl && !input.allowDuplicate) {
      const key = jobUrlKey(jobUrl);
      const existing = (await getDashboardData()).find((a) => a.jobUrl && jobUrlKey(a.jobUrl) === key);
      if (existing) {
        // Still clear the inbox link — the job is in the tracker either way.
        await markSavedLinkDone(existing.id, { savedLinkId: input.inboxLinkId ?? null, jobUrl });
        return fail(
          `Already saved: ${existing.company.name} – ${existing.roleTitle} (${existing.currentStatus}), id ${existing.id}, ${appLink(existing.id)}. Its inbox link has been cleared. Pass allowDuplicate: true to save it again anyway.`
        );
      }
    }

    const id = await createApplication({
      companyName: input.companyName,
      website: input.companyWebsite ?? null,
      industry: input.industry ?? null,
      interestLevel: input.interestLevel ?? 3,
      roleTitle: input.roleTitle,
      roleDescription: input.roleDescription,
      source: input.source ?? sourceFor(jobUrl),
      jobUrl,
    });
    await markSavedLinkDone(id, { savedLinkId: input.inboxLinkId ?? null, jobUrl });
    return reply({ id, link: appLink(id), status: "To apply" });
  }
);

server.registerTool(
  "save_cover_letter",
  {
    title: "Save cover letter",
    description:
      "Saves a cover letter you wrote to the application's draft history. It becomes the application's letter if it has none yet; otherwise the user picks it with \"Use this version\" in the app. Send only the letter text.",
    inputSchema: {
      applicationId: z.string(),
      letter: z.string().trim().min(1),
      model: z.string().optional().describe("Your model name, shown next to the draft"),
    },
  },
  async ({ applicationId, letter, model }) => {
    const app = await getApplication(applicationId);
    if (!app) return fail(`No application with id ${applicationId}.`);
    const draftId = await saveWrittenDraft(applicationId, letter, model ?? "Claude");
    const becameCurrent = !app.coverLetter?.trim();
    if (becameCurrent) await setCoverLetter(applicationId, letter);
    return reply({
      draftId,
      link: `${appLink(applicationId)}#cover-letter`,
      note: becameCurrent
        ? "Saved as the application's cover letter."
        : "Saved as a draft; the application already had a letter, so the user can switch to this one in the app.",
    });
  }
);

server.registerTool(
  "update_status",
  {
    title: "Update status",
    description:
      'Adds a status update to an application, e.g. "Applied" once the user has sent it (this also records the applied date). Only when the user says so.',
    inputSchema: {
      applicationId: z.string(),
      status: z.enum(STATUS_STAGES),
      note: z.string().optional(),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("YYYY-MM-DD, default today"),
    },
  },
  async ({ applicationId, status, note, date }) => {
    const app = await getApplication(applicationId);
    if (!app) return fail(`No application with id ${applicationId}.`);
    await recordStatusEvent(applicationId, status, note ?? null, date ?? today());
    return reply(`${app.company.name} – ${app.roleTitle} is now "${status}".`);
  }
);

async function main() {
  await server.connect(new StdioServerTransport());
  console.error("job-crm MCP server running on stdio");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
