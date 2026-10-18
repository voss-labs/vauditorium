import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { driverFor, pglitePath } from "./driver";
import * as schema from "./schema";

// Typed as the Neon database because that is what production is. The local
// drivers are API-compatible for everything this codebase does, with one real
// difference: node-postgres and PGlite support interactive transactions and
// neon-http does not. Code must never assume them, or it will work locally and
// fail in production. Use db.batch() for multi-statement atomic writes.
export type Database = NeonHttpDatabase<typeof schema>;

let _db: Promise<Database> | null = null;

async function connect(): Promise<Database> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");

  // Local drivers are imported lazily: production never takes these branches,
  // and PGlite is a dev dependency that is not installed on the deploy.
  switch (driverFor(url)) {
    case "pglite": {
      const { PGlite } = await import("@electric-sql/pglite");
      const { drizzle } = await import("drizzle-orm/pglite");
      return drizzle(new PGlite(pglitePath(url)), { schema }) as unknown as Database;
    }
    case "pg": {
      const { Pool } = await import("pg");
      const { drizzle } = await import("drizzle-orm/node-postgres");
      return drizzle(new Pool({ connectionString: url }), { schema }) as unknown as Database;
    }
    case "neon": {
      const { neon } = await import("@neondatabase/serverless");
      const { drizzle } = await import("drizzle-orm/neon-http");
      return drizzle(neon(url), { schema });
    }
  }
}

/** The shared database client, created on first use. */
export function getDb(): Promise<Database> {
  _db ??= connect().catch((err) => {
    _db = null; // let the next request retry instead of caching the failure
    throw err;
  });
  return _db;
}

/**
 * Close the connection, for scripts. PGlite must be closed cleanly or the next
 * open runs crash recovery, which skips ahead in every identity sequence.
 */
export async function closeDb(): Promise<void> {
  if (!_db) return;
  const db = (await _db) as unknown as { $client?: { close?: () => Promise<void>; end?: () => Promise<void> } };
  _db = null;
  await (db.$client?.close ?? db.$client?.end)?.call(db.$client);
}
