import { notFound } from "next/navigation";
import { getCompanyNames, getDashboardData } from "@/lib/actions/actions";
import { jobUrlKey } from "@/lib/jobUrl";
import { getSavedLink } from "@/lib/actions/savedLinks";
import { consumeImport } from "@/lib/importStore";
import NewApplicationFlow from "./NewApplicationFlow";

export default async function NewApplicationPage({
  searchParams,
}: {
  searchParams: Promise<{ import?: string; saved?: string }>;
}) {
  const { import: importId, saved: savedId } = await searchParams;
  const [existingCompanies, apps] = await Promise.all([getCompanyNames(), getDashboardData()]);
  const existingJobs = apps
    .filter((a) => a.jobUrl)
    .map((a) => ({
      key: jobUrlKey(a.jobUrl!),
      id: a.id,
      label: `${a.company.name} – ${a.roleTitle}`,
      status: a.currentStatus,
    }));
  const imported = importId ? consumeImport(importId) : null;
  const savedLink = savedId ? await getSavedLink(savedId) : null;
  if (savedId && !savedLink) notFound();

  return (
    <NewApplicationFlow
      existingCompanies={existingCompanies}
      existingJobs={existingJobs}
      initialExtracted={imported}
      savedLink={savedLink}
    />
  );
}
