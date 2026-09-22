"use server";

import { db } from "@/lib/db";
import { companies, applications, statusEvents, followUps } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { extractJobPostingFromUrl, type ExtractedJobPosting } from "@/lib/jobPosting";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function extractJobPosting(url: string): Promise<ExtractedJobPosting> {
  return extractJobPostingFromUrl(url);
}

export async function deleteApplication(applicationId: number) {
  await db.delete(applications).where(eq(applications.id, applicationId));
  revalidatePath("/");
  redirect("/");
}

export async function createCompanyAndApplication(formData: FormData) {
  const companyName = (formData.get("companyName") as string)?.trim();
  const website = (formData.get("website") as string)?.trim() || null;
  const interestLevel = Number(formData.get("interestLevel") || 3);
  const roleTitle = (formData.get("roleTitle") as string)?.trim();
  const roleDescription = (formData.get("roleDescription") as string)?.trim() || null;
  const source = (formData.get("source") as string)?.trim() || null;
  const jobUrl = (formData.get("jobUrl") as string)?.trim() || null;
  const appliedDate = (formData.get("appliedDate") as string) || today();

  if (!companyName || !roleTitle) {
    throw new Error("Company name and role title are required.");
  }

  // Reuse an existing company with the same name if present, else create one.
  let companyId: number;
  const existing = await db
    .select()
    .from(companies)
    .where(eq(companies.name, companyName))
    .limit(1);

  if (existing.length > 0) {
    companyId = existing[0].id;
  } else {
    const [created] = await db
      .insert(companies)
      .values({ name: companyName, website, interestLevel })
      .returning();
    companyId = created.id;
  }

  const [app] = await db
    .insert(applications)
    .values({
      companyId,
      roleTitle,
      roleDescription,
      source,
      jobUrl,
      appliedDate,
      currentStatus: "Applied",
    })
    .returning();

  await db.insert(statusEvents).values({
    applicationId: app.id,
    status: "Applied",
    eventDate: appliedDate,
  });

  revalidatePath("/");
  redirect(`/applications/${app.id}`);
}

export async function addStatusEvent(formData: FormData) {
  const applicationId = Number(formData.get("applicationId"));
  const status = (formData.get("status") as string)?.trim();
  const note = (formData.get("note") as string)?.trim() || null;
  const eventDate = (formData.get("eventDate") as string) || today();

  if (!applicationId || !status) throw new Error("Missing status event fields.");

  await db.insert(statusEvents).values({ applicationId, status, note, eventDate });
  await db
    .update(applications)
    .set({ currentStatus: status })
    .where(eq(applications.id, applicationId));

  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/");
}

export async function addFollowUp(formData: FormData) {
  const applicationId = Number(formData.get("applicationId"));
  const dueDate = formData.get("dueDate") as string;
  const note = (formData.get("note") as string)?.trim() || null;

  if (!applicationId || !dueDate) throw new Error("Missing follow-up fields.");

  await db.insert(followUps).values({ applicationId, dueDate, note });
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/");
}

export async function toggleFollowUpDone(followUpId: number, applicationId: number, done: boolean) {
  await db.update(followUps).set({ done }).where(eq(followUps.id, followUpId));
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/");
}

export async function getDashboardData() {
  const apps = await db.query.applications.findMany({
    with: { company: true, statusEvents: true, followUps: true },
    orderBy: [desc(applications.createdAt)],
  });

  return apps
    .map((a) => {
      const lastEvent = [...a.statusEvents].sort((x, y) =>
        y.eventDate.localeCompare(x.eventDate)
      )[0];
      const daysSince = lastEvent
        ? Math.floor(
            (Date.now() - new Date(lastEvent.eventDate).getTime()) / 86400000
          )
        : null;
      const openFollowUps = a.followUps.filter((f) => !f.done);
      return { ...a, daysSinceUpdate: daysSince, openFollowUps };
    })
    .sort((a, b) => (b.daysSinceUpdate ?? 0) - (a.daysSinceUpdate ?? 0));
}

export async function getApplication(id: number) {
  return db.query.applications.findFirst({
    where: eq(applications.id, id),
    with: {
      company: true,
      statusEvents: { orderBy: [desc(statusEvents.eventDate)] },
      followUps: { orderBy: [desc(followUps.dueDate)] },
    },
  });
}
