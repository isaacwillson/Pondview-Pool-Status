#!/usr/bin/env node
/**
 * Dev seed: generates plausible occupancy readings for the last 7 days
 * (or however many you pass via --days) and inserts them into the
 * `occupancy_readings` table so the dashboard has something to render
 * before the real camera is online.
 *
 * Usage (with .env.local sourced):
 *   node scripts/seed-readings.mjs                 # 7 days
 *   node scripts/seed-readings.mjs --days 14       # 14 days
 *   node scripts/seed-readings.mjs --reset         # truncate first
 *
 * Requires DATABASE_URL in the environment.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

// --- minimal .env.local loader (no extra deps) ---------------------------
function loadDotEnvLocal() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const envPath = join(here, "..", ".env.local");
    const text = readFileSync(envPath, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // .env.local optional
  }
}
loadDotEnvLocal();

// --- args ----------------------------------------------------------------
const args = process.argv.slice(2);
const days = (() => {
  const i = args.indexOf("--days");
  if (i >= 0 && args[i + 1]) return Math.max(1, parseInt(args[i + 1], 10));
  return 7;
})();
const reset = args.includes("--reset");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1);
}

const CAPACITY = 60;

// Same shape as the production curve in lib/mock-data.ts. Index = hour 0–23.
const HOURLY_BASE = [
  0.02, 0.02, 0.02, 0.02, 0.04, 0.08, 0.14, 0.22,
  0.28, 0.32, 0.40, 0.50, 0.58, 0.62, 0.66, 0.72,
  0.80, 0.92, 0.95, 0.74, 0.42, 0.22, 0.10, 0.05,
];

// Weekend boost — Saturday peaks; Sunday strong; midweek lower.
const DOW_MULTIPLIER = [0.95, 0.78, 0.80, 0.85, 0.95, 1.05, 1.25, 1.10];
// 0 placeholder so we can index by JS getDay() (0 = Sun … 6 = Sat).
//   index: 0    1    2    3    4    5    6
//          Sun  Mon  Tue  Wed  Thu  Fri  Sat
const DOW_MAP = [1.10, 0.78, 0.80, 0.85, 0.95, 1.05, 1.25];

function noise() {
  // Gentle ±10% jitter so days don't look identical.
  return 1 + (Math.random() - 0.5) * 0.2;
}

function readingAt(date) {
  const hour = date.getHours();
  const base = HOURLY_BASE[hour];
  const dow = DOW_MAP[date.getDay()];
  const pct = Math.min(1, Math.max(0, base * dow * noise()));
  return Math.round(pct * CAPACITY);
}

const sql = postgres(DATABASE_URL, { max: 4 });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS occupancy_readings (
      id          BIGSERIAL PRIMARY KEY,
      recorded_at TIMESTAMPTZ NOT NULL,
      occupancy   INTEGER NOT NULL CHECK (occupancy >= 0),
      capacity    INTEGER NOT NULL CHECK (capacity > 0)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS occupancy_readings_recorded_at_idx
      ON occupancy_readings (recorded_at DESC)
  `;

  if (reset) {
    console.log("Truncating occupancy_readings…");
    await sql`TRUNCATE occupancy_readings`;
  }

  const rows = [];
  const now = new Date();
  // Round down to the next 5-minute boundary so the seeded stream lines
  // up with the camera's expected cadence.
  const stepMs = 5 * 60_000;
  const endMs = Math.floor(now.getTime() / stepMs) * stepMs;
  const startMs = endMs - days * 24 * 60 * 60 * 1000;

  for (let t = startMs; t <= endMs; t += stepMs) {
    const recordedAt = new Date(t);
    rows.push({
      recorded_at: recordedAt,
      occupancy: readingAt(recordedAt),
      capacity: CAPACITY,
    });
  }

  console.log(
    `Inserting ${rows.length} readings spanning ${days} day(s)…`,
  );
  // Chunk for friendliness on free-tier connections.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await sql`
      INSERT INTO occupancy_readings ${sql(slice, "recorded_at", "occupancy", "capacity")}
    `;
  }

  console.log(`Done. Inserted ${rows.length} readings.`);
} catch (err) {
  console.error("Seed failed:", err);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
