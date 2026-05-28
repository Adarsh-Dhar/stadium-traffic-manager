import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Pool size 20 — at 2000 concurrent workers this WILL exhaust and queue up,
// which is exactly what creates real latency pressure you can see in Dynatrace.
// Raise to 50 to make the system handle more; leave at 20 to see it struggle.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 50,               // increased to 50 to provide headroom under heavy load
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,  // fail fast when pool is full
});

pool.on("error", (err) => {
  console.error("[pg pool] unexpected error", err.message);
});

export const db = drizzle(pool, { schema });
export * from "./schema";
