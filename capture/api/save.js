// POST /api/save — the phone's "Save to Job CRM" share target.
//
// Deployed on its own (Vercel, root directory "capture/") so links can be
// saved while the laptop is off; the job-crm app reads them from the same
// Atlas database. This is the only part of job-crm that is reachable from
// the internet, so it does one thing: check the token, store a link.
//
// Env: CAPTURE_TOKEN (long random string, also stored in the phone shortcut),
//      MONGODB_URI, MONGODB_DB (defaults to "job-crm").
//
// Body: the shared text as text/plain, or JSON {"text": "..."}.

import { createHash, timingSafeEqual } from "node:crypto";
import { MongoClient } from "mongodb";

const MAX_BODY_BYTES = 10_000;

// Reused across warm invocations.
let clientPromise;
function savedLinks() {
  clientPromise ??= new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  }).connect();
  return clientPromise.then((c) =>
    c.db(process.env.MONGODB_DB || "job-crm").collection("savedLinks")
  );
}

// Hash both sides so the comparison is constant-time regardless of length.
function tokenMatches(given) {
  const expected = process.env.CAPTURE_TOKEN;
  if (!expected || expected.length < 32 || !given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Same as lib/sharedLink.ts in the app — keep in sync.
function parseSharedLink(text) {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;
  const url = match[0].replace(/[).,;!?]+$/, "");
  try {
    new URL(url);
  } catch {
    return null;
  }
  const rest = text.replace(match[0], "").trim();
  return { url, sharedText: rest || null };
}

function reply(status, body) {
  return Response.json(body, { status });
}

export async function POST(request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!tokenMatches(auth.replace(/^Bearer\s+/i, ""))) {
    return reply(401, { error: "Unauthorized" });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return reply(413, { error: "Too large" });

  let text = raw;
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      text = String(JSON.parse(raw).text ?? "");
    } catch {
      return reply(400, { error: "Invalid JSON" });
    }
  }

  const parsed = parseSharedLink(text);
  if (!parsed) {
    // Shows in Vercel's logs — enough to tell an empty share variable from a
    // leftover placeholder without logging whole bodies.
    console.log(`400 no link: ${text.length} chars, starts ${JSON.stringify(text.slice(0, 40))}`);
    return reply(400, { error: "No link found in what was shared" });
  }

  const col = await savedLinks();
  await col.insertOne({
    url: parsed.url,
    sharedText: parsed.sharedText,
    status: "new",
    applicationId: null,
    receivedAt: new Date().toISOString(),
  });

  return reply(201, { saved: parsed.url });
}
