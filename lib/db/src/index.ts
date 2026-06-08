import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Connection-pool tuning. The previous default (`new Pool({ connectionString })`)
// capped the pool at 10 connections and waited forever when all were busy, so
// the 11th concurrent request would hang behind the first 10 — the hardest
// ceiling on concurrency. These settings are all env-overridable so each
// deployment can size the pool to its Postgres `max_connections` budget
// (remember: total connections = DB_POOL_MAX × number of server instances).
// Behaviour for every query is unchanged — only how many can run at once.
const num = (v: string | undefined, fallback: number) => {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Max simultaneous DB connections this instance holds open.
  max: num(process.env.DB_POOL_MAX, 20),
  // Drop idle connections after 30s so the pool shrinks during quiet periods.
  idleTimeoutMillis: num(process.env.DB_POOL_IDLE_MS, 30_000),
  // Fail fast (10s) instead of hanging forever when the pool is saturated, so a
  // load spike surfaces as a clean error rather than infinitely queued requests.
  connectionTimeoutMillis: num(process.env.DB_POOL_CONN_TIMEOUT_MS, 10_000),
  // TCP keepalive prevents idle connections being silently dropped by the
  // network/proxy, which otherwise shows up as intermittent query errors.
  keepAlive: true,
});

// A pool-level error listener prevents an idle-client network error from
// crashing the whole process (node-postgres emits 'error' on the pool for
// background failures). We log and let the pool replace the dead client.
pool.on("error", (err) => {
  console.error("[db] idle pool client error", err);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
