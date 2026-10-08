// MongoDB Atlas client. Only activates when MONGODB_URI is set — until then
// isMongoConfigured() returns false and the app falls back to local SQLite.
// See lib/db/mongoStatus.ts for the connectivity check + lib/db/mongoCollections.ts
// for the document shapes.

import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "job-crm";

// Preserve the client (and its connection pool) across Next.js dev
// hot-reloads instead of opening a new one on every module reload.
declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function createClientPromise(): Promise<MongoClient> | null {
  if (!uri) return null;

  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = new MongoClient(uri, {
        serverSelectionTimeoutMS: 5000,
      }).connect();
    }
    return global._mongoClientPromise;
  }

  return new MongoClient(uri, { serverSelectionTimeoutMS: 5000 }).connect();
}

const clientPromise = createClientPromise();

export function isMongoConfigured(): boolean {
  return clientPromise !== null;
}

export async function getMongoDb(): Promise<Db | null> {
  if (!clientPromise) return null;
  const client = await clientPromise;
  return client.db(dbName);
}
