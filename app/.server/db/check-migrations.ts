// Confirms every migration in the repo is recorded as applied in the database.
//
//   npm run db:check
//
// The deploy runs this after migrating and before shipping: a build that
// queries a column its migration never created is the failure it prevents.

import "dotenv/config";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "./index";

interface Journal {
  entries: { tag: string; when: number }[];
}

const journal: Journal = JSON.parse(
  readFileSync(new URL("./migrations/meta/_journal.json", import.meta.url), "utf8"),
);

const db = await getDb();
// drizzle-kit records each applied migration by the journal's `when` timestamp.
const result = await db.execute<{ created_at: string | number }>(
  sql`SELECT created_at FROM drizzle.__drizzle_migrations`,
);
const applied = new Set(result.rows.map((r) => Number(r.created_at)));

await closeDb();

const missing = journal.entries.filter((e) => !applied.has(e.when));
if (missing.length > 0) {
  console.error(`Not applied: ${missing.map((e) => e.tag).join(", ")}`);
  process.exit(1);
}
console.log(`All ${journal.entries.length} migrations applied.`);
