import { getMongoDb, isMongoConfigured } from "./mongo";

export type DatabaseStatus = {
  configured: boolean;
  connected: boolean;
  error?: string;
};

// Deliberately sticky: once we've confirmed a live connection, we keep
// routing reads/writes to Mongo even if a later ping has a transient
// hiccup, instead of re-deciding per call. Flip-flopping the backend
// mid-session silently splits data across two stores — a write can land
// in SQLite during a bad window and become invisible once Mongo recovers
// and later reads go back to it. Only "not yet connected" gets re-checked
// on a timer; a confirmed connection is trusted for the rest of the
// process lifetime (the driver's own connection pool handles reconnects).
let confirmedConnected = false;
let lastFailure: { error?: string; checkedAt: number } | null = null;
const RECHECK_MS = 30_000;

export async function getMongoStatus(): Promise<DatabaseStatus> {
  if (!isMongoConfigured()) return { configured: false, connected: false };
  if (confirmedConnected) return { configured: true, connected: true };

  const now = Date.now();
  if (lastFailure && now - lastFailure.checkedAt < RECHECK_MS) {
    return { configured: true, connected: false, error: lastFailure.error };
  }

  try {
    const db = await getMongoDb();
    await db?.command({ ping: 1 });
    confirmedConnected = true;
    return { configured: true, connected: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    lastFailure = { error, checkedAt: now };
    return { configured: true, connected: false, error };
  }
}
