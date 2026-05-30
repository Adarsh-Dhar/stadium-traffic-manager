import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let pool: any = null;
let db: any = null;

if (process.env.DATABASE_URL) {
  // Pool size 20 — at 2000 concurrent workers this WILL exhaust and queue up,
  // which is exactly what creates real latency pressure you can see in Dynatrace.
  // Raise to 50 to make the system handle more; leave at 20 to see it struggle.
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 100,               // increased to 100 to provide headroom under heavy load
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,  // allow a bit more time when pool is busy
  });

  pool.on("error", (err: Error) => {
    console.error("[pg pool] unexpected error", err.message);
  });

  db = drizzle(pool, { schema });
} else {
  console.warn("[db] DATABASE_URL not set — running in mock mode (no database)");
  // Mock pool for testing
  pool = {
    totalCount: 1,
    idleCount: 1,
    waitingCount: 0,
  };
  // Mock db that returns empty results
  db = {
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
    insert: () => ({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    execute: () => Promise.resolve({ rows: [] }),
  };
}

export { pool, db };
export * from "./schema";
