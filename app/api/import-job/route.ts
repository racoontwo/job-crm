import { NextRequest, NextResponse } from "next/server";
import { createImport } from "@/lib/importStore";

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export async function POST(request: NextRequest) {
  // Requiring application/json forces a CORS preflight, which this route never
  // answers — so other websites open in the browser can't POST imports here.
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  if (typeof payload.jobUrl !== "string" || !payload.jobUrl) {
    return NextResponse.json({ error: "jobUrl is required" }, { status: 400 });
  }

  const id = createImport({
    companyName: asString(payload.companyName),
    companyWebsite: asString(payload.companyWebsite),
    industry: asString(payload.industry),
    roleTitle: asString(payload.roleTitle),
    roleDescription: asString(payload.roleDescription),
    source: asString(payload.source),
    jobUrl: payload.jobUrl,
  });

  const reviewUrl = new URL(`/applications/new?import=${id}`, request.url).toString();
  return NextResponse.json({ importId: id, reviewUrl });
}
