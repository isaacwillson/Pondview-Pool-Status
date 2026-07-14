/**
 * Postgres client + idempotent schema bootstrap.
 *
 * The client uses the `postgres` driver (porsager) — works on any
 * Postgres provider (Neon, Supabase, Railway, …). One env var:
 * `DATABASE_URL`.
 *
 * In local dev without `DATABASE_URL`, queries return null/empty so
 * the UI gracefully shows the "Not enough data yet" empty states.
 * In production a missing URL throws — we don't want to silently
 * accept writes that go nowhere.
 */
import "server-only";
import postgres, { type Sql } from "postgres";

let sql: Sql | null = null;
let schemaReady: Promise<void> | null = null;
let warnedAboutMissingDb = false;

/** Whether a database connection string is configured. */
export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Returns the postgres client, or `null` if no `DATABASE_URL` in dev. */
export function getSql(): Sql | null {
  if (sql) return sql;

  const url = process.env.DATABASE_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DATABASE_URL must be set in production.");
    }
    if (!warnedAboutMissingDb) {
      console.warn(
        "[db] DATABASE_URL not set — occupancy queries will return empty results. Set DATABASE_URL to connect to Postgres.",
      );
      warnedAboutMissingDb = true;
    }
    return null;
  }

  sql = postgres(url, {
    // Vercel Functions keep instances warm only briefly; keep the pool small.
    max: 4,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return sql;
}

/**
 * Ensures the `occupancy_readings` table exists. Idempotent and
 * memoised — runs at most once per process. Call this before any
 * query helper that touches the table.
 */
export async function ensureSchema(): Promise<void> {
  const client = getSql();
  if (!client) return;

  if (!schemaReady) {
    schemaReady = (async () => {
      await client`
        CREATE TABLE IF NOT EXISTS occupancy_readings (
          id          BIGSERIAL PRIMARY KEY,
          recorded_at TIMESTAMPTZ NOT NULL,
          occupancy   INTEGER NOT NULL CHECK (occupancy >= 0),
          capacity    INTEGER NOT NULL CHECK (capacity > 0)
        )
      `;
      await client`
        CREATE INDEX IF NOT EXISTS occupancy_readings_recorded_at_idx
          ON occupancy_readings (recorded_at DESC)
      `;
    })().catch((err) => {
      // Reset so the next request can retry.
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}
