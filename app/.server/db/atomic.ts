import type { BatchItem } from "drizzle-orm/batch";
import { driverFor } from "./driver";
import type { Database } from "./index";

type Statements = [BatchItem<"pg">, ...BatchItem<"pg">[]];

/**
 * Run several writes all-or-nothing.
 *
 * neon-http has no interactive transactions, only db.batch(), which sends the
 * statements together and runs them in one transaction. The local drivers have
 * no batch() but do have transactions. This takes a builder so each driver gets
 * statements bound to the right handle. It cannot read between statements,
 * which is the constraint production imposes anyway.
 */
export async function atomic(db: Database, build: (tx: Database) => Statements): Promise<void> {
  if (driverFor(process.env.DATABASE_URL ?? "") === "neon") {
    await db.batch(build(db));
    return;
  }
  const local = db as unknown as { transaction(fn: (tx: Database) => Promise<void>): Promise<void> };
  await local.transaction(async (tx) => {
    for (const statement of build(tx)) await statement;
  });
}
