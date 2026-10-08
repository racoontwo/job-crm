import { getCompanyNames } from "@/lib/actions/actions";
import { consumeImport } from "@/lib/importStore";
import NewApplicationFlow from "./NewApplicationFlow";

export default async function NewApplicationPage({
  searchParams,
}: {
  searchParams: Promise<{ import?: string }>;
}) {
  const { import: importId } = await searchParams;
  const existingCompanies = await getCompanyNames();
  const imported = importId ? consumeImport(importId) : null;

  return <NewApplicationFlow existingCompanies={existingCompanies} initialExtracted={imported} />;
}
