import { db } from "@/lib/db";
import NewApplicationFlow from "./NewApplicationFlow";

export default async function NewApplicationPage() {
  const existingCompanies = await db.query.companies.findMany();

  return <NewApplicationFlow existingCompanies={existingCompanies} />;
}
