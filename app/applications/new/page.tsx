import { notFound } from "next/navigation";
import { getCompanyNames } from "@/lib/actions/actions";
import { getSavedLink } from "@/lib/actions/savedLinks";
import { consumeImport } from "@/lib/importStore";
import NewApplicationFlow from "./NewApplicationFlow";

export default async function NewApplicationPage({
  searchParams,
}: {
  searchParams: Promise<{ import?: string; saved?: string }>;
}) {
  const { import: importId, saved: savedId } = await searchParams;
  const existingCompanies = await getCompanyNames();
  const imported = importId ? consumeImport(importId) : null;
  const savedLink = savedId ? await getSavedLink(savedId) : null;
  if (savedId && !savedLink) notFound();

  return (
    <NewApplicationFlow
      existingCompanies={existingCompanies}
      initialExtracted={imported}
      savedLink={savedLink}
    />
  );
}
