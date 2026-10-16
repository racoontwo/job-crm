"use server";

// Inbox actions for the pages; the data side is lib/db/savedLinks.ts.

import { revalidatePath } from "next/cache";
import * as links from "@/lib/db/savedLinks";

export async function getNewSavedLinks() {
  return links.getNewSavedLinks();
}

export async function getSavedLink(id: string) {
  return links.getSavedLink(id);
}

export async function saveLink(formData: FormData) {
  await links.addSavedLink((formData.get("link") as string) ?? "");
  revalidatePath("/inbox");
}

export async function dismissSavedLink(formData: FormData) {
  // Comma-separated: the inbox dismisses all shares of the same job together.
  const ids = ((formData.get("savedLinkId") as string) ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) throw new Error("Missing saved link id.");
  await links.dismissSavedLinks(ids);
  revalidatePath("/inbox");
}

export async function markSavedLinkDone(
  applicationId: string,
  match: { savedLinkId: string | null; jobUrl: string | null }
) {
  await links.markSavedLinkDone(applicationId, match);
  revalidatePath("/inbox");
}
