/**
 * Aggregation queries over the `occupancy_readings` time-series.
 *
 * The `getLive*` / `getToday*` / `getWeekly*` helpers each return
 * `null` when there isn't enough data to answer the question. UI
 * components branch on that null to show the "Not enough data yet"
 * placeholder.
 */
import "server-only";
import {
  POOL_CLOSE_HOUR,
  POOL_OPEN_HOUR,
  POOL_TIMEZONE,
  TREND_WINDOW_MS,
  WEEKLY_USAGE_MIN_DAYS,
} from "./config";
import { ensureSchema, getSql } from "./db";
import type { HourlyActivity, Trend, WeeklyUsage } from "./types";
import { activityToCrowdLevel } from "./mock-data";

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface ReadingInput {
  occupancy: number;
  capacity: number;
  recordedAt?: Date;
}

export async function insertReading(input: ReadingInput): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  await ensureSchema();
  await sql`
    INSERT INTO occupancy_readings (recorded_at, occupancy, capacity)
    VALUES (
      ${input.recordedAt ?? new Date()},
      ${input.occupancy},
      ${input.capacity}
    )
  `;
}

// ---------------------------------------------------------------------------
// Live status
// ---------------------------------------------------------------------------

export interface LatestReading {
  occupancy: number;
  capacity: number;
  recordedAt: Date;
}

export async function getLatestReading(): Promise<LatestReading | null> {
  const sql = getSql();
  if (!sql) return null;
  await ensureSchema();

  const rows = await sql<
    { occupancy: number; capacity: number; recorded_at: Date }[]
  >`
    SELECT occupancy, capacity, recorded_at
    FROM occupancy_readings
    ORDER BY recorded_at DESC
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    occupancy: r.occupancy,
    capacity: r.capacity,
    recordedAt: r.recorded_at,
  };
}

/** Compares the latest reading to one ~30 min ago to derive a trend. */
export async function getTrend(): Promise<Trend> {
  const sql = getSql();
  if (!sql) return "steady";
  await ensureSchema();

  const windowMinutes = Math.round(TREND_WINDOW_MS / 60_000);
  // Tolerance window so a missing exact-30-min-ago reading still finds
  // one nearby; otherwise small gaps would always look "steady".
  const rows = await sql<{ then_avg: number | null; now_occ: number | null }[]>`
    WITH latest AS (
      SELECT occupancy
      FROM occupancy_readings
      ORDER BY recorded_at DESC
      LIMIT 1
    ),
    earlier AS (
      SELECT AVG(occupancy)::float AS avg_occ
      FROM occupancy_readings
      WHERE recorded_at BETWEEN NOW() - (${windowMinutes + 5} || ' minutes')::interval
                            AND NOW() - (${windowMinutes - 5} || ' minutes')::interval
    )
    SELECT
      (SELECT avg_occ FROM earlier) AS then_avg,
      (SELECT occupancy FROM latest) AS now_occ
  `;
  const { then_avg, now_occ } = rows[0];
  if (then_avg === null || now_occ === null) return "steady";
  const delta = now_occ - then_avg;
  if (delta >= 2) return "rising";
  if (delta <= -2) return "falling";
  return "steady";
}

// ---------------------------------------------------------------------------
// Hourly activity (for the chart) — three periods: today, yesterday, 7-day avg
// ---------------------------------------------------------------------------

/** Turn a set of (hour, avg_pct) rows into a 24-entry HourlyActivity[]. */
function fillHourly(
  rows: { hour: number; avg_pct: number }[],
): HourlyActivity[] {
  const byHour = new Map(rows.map((r) => [r.hour, Number(r.avg_pct ?? 0)]));
  return Array.from({ length: 24 }, (_, hour) => {
    const activity = byHour.get(hour) ?? 0;
    return { hour, activity, label: activityToCrowdLevel(activity) };
  });
}

export async function getTodayHourlyActivity(): Promise<
  HourlyActivity[] | null
> {
  const sql = getSql();
  if (!sql) return null;
  await ensureSchema();

  const rows = await sql<{ hour: number; avg_pct: number }[]>`
    SELECT
      EXTRACT(hour FROM recorded_at AT TIME ZONE ${POOL_TIMEZONE})::int AS hour,
      AVG(occupancy::float / NULLIF(capacity, 0)) AS avg_pct
    FROM occupancy_readings
    WHERE recorded_at >= DATE_TRUNC('day', NOW() AT TIME ZONE ${POOL_TIMEZONE})
                          AT TIME ZONE ${POOL_TIMEZONE}
    GROUP BY hour
    ORDER BY hour
  `;
  if (rows.length === 0) return null;
  return fillHourly(rows);
}

export async function getYesterdayHourlyActivity(): Promise<
  HourlyActivity[] | null
> {
  const sql = getSql();
  if (!sql) return null;
  await ensureSchema();

  // Yesterday = the full calendar day in pool-local time immediately before
  // today. Boundaries are converted back to TIMESTAMPTZ so the comparison
  // against `recorded_at` (UTC instants) works correctly.
  const rows = await sql<{ hour: number; avg_pct: number }[]>`
    SELECT
      EXTRACT(hour FROM recorded_at AT TIME ZONE ${POOL_TIMEZONE})::int AS hour,
      AVG(occupancy::float / NULLIF(capacity, 0)) AS avg_pct
    FROM occupancy_readings
    WHERE recorded_at >= (DATE_TRUNC('day', NOW() AT TIME ZONE ${POOL_TIMEZONE}) - INTERVAL '1 day')
                          AT TIME ZONE ${POOL_TIMEZONE}
      AND recorded_at < DATE_TRUNC('day', NOW() AT TIME ZONE ${POOL_TIMEZONE})
                          AT TIME ZONE ${POOL_TIMEZONE}
    GROUP BY hour
    ORDER BY hour
  `;
  if (rows.length === 0) return null;
  return fillHourly(rows);
}

export async function getAverageHourlyActivity(): Promise<
  HourlyActivity[] | null
> {
  const sql = getSql();
  if (!sql) return null;
  await ensureSchema();

  // Rolling 7-day mean per hour-of-day. Same group-by-hour shape so the
  // chart can render it the same way as today/yesterday.
  const rows = await sql<{ hour: number; avg_pct: number }[]>`
    SELECT
      EXTRACT(hour FROM recorded_at AT TIME ZONE ${POOL_TIMEZONE})::int AS hour,
      AVG(occupancy::float / NULLIF(capacity, 0)) AS avg_pct
    FROM occupancy_readings
    WHERE recorded_at >= NOW() - INTERVAL '7 days'
    GROUP BY hour
    ORDER BY hour
  `;
  if (rows.length === 0) return null;
  return fillHourly(rows);
}

// ---------------------------------------------------------------------------
// Weekly usage
// ---------------------------------------------------------------------------

/** Number of distinct local days that have at least one reading recently. */
async function countDistinctRecentDays(days: number): Promise<number> {
  const sql = getSql();
  if (!sql) return 0;
  const rows = await sql<{ days: number }[]>`
    SELECT COUNT(DISTINCT DATE(recorded_at AT TIME ZONE ${POOL_TIMEZONE}))::int AS days
    FROM occupancy_readings
    WHERE recorded_at >= NOW() - (${days} || ' days')::interval
  `;
  return rows[0]?.days ?? 0;
}

export async function getWeeklyUsage(): Promise<WeeklyUsage | null> {
  const sql = getSql();
  if (!sql) return null;
  await ensureSchema();

  if ((await countDistinctRecentDays(WEEKLY_USAGE_MIN_DAYS)) < WEEKLY_USAGE_MIN_DAYS) {
    return null;
  }

  const [peakRows, avgRows, slotRows] = await Promise.all([
    // Peak day — day-of-week with the highest average occupancy.
    sql<{ day_name: string; avg_occ: number }[]>`
      SELECT
        TRIM(TO_CHAR(recorded_at AT TIME ZONE ${POOL_TIMEZONE}, 'FMDay')) AS day_name,
        AVG(occupancy)::float AS avg_occ
      FROM occupancy_readings
      WHERE recorded_at >= NOW() - INTERVAL '7 days'
        AND EXTRACT(hour FROM recorded_at AT TIME ZONE ${POOL_TIMEZONE})
            BETWEEN ${POOL_OPEN_HOUR} AND ${POOL_CLOSE_HOUR - 1}
      GROUP BY day_name
      ORDER BY avg_occ DESC NULLS LAST
      LIMIT 1
    `,
    // Overall 7-day average across open hours.
    sql<{ avg_occ: number | null }[]>`
      SELECT AVG(occupancy)::float AS avg_occ
      FROM occupancy_readings
      WHERE recorded_at >= NOW() - INTERVAL '7 days'
        AND EXTRACT(hour FROM recorded_at AT TIME ZONE ${POOL_TIMEZONE})
            BETWEEN ${POOL_OPEN_HOUR} AND ${POOL_CLOSE_HOUR - 1}
    `,
    // 30-min slots ranked by average occupancy. We need both ends.
    sql<{ hour: number; minute: number; avg_occ: number }[]>`
      SELECT
        EXTRACT(hour FROM recorded_at AT TIME ZONE ${POOL_TIMEZONE})::int AS hour,
        (FLOOR(EXTRACT(minute FROM recorded_at AT TIME ZONE ${POOL_TIMEZONE}) / 30) * 30)::int AS minute,
        AVG(occupancy)::float AS avg_occ
      FROM occupancy_readings
      WHERE recorded_at >= NOW() - INTERVAL '7 days'
        AND EXTRACT(hour FROM recorded_at AT TIME ZONE ${POOL_TIMEZONE})
            BETWEEN ${POOL_OPEN_HOUR} AND ${POOL_CLOSE_HOUR - 1}
      GROUP BY hour, minute
      ORDER BY avg_occ ASC NULLS LAST
    `,
  ]);

  if (slotRows.length === 0 || peakRows.length === 0) return null;

  const quietest = slotRows[0];
  const popular = slotRows[slotRows.length - 1];

  return {
    peakDay: {
      day: peakRows[0].day_name,
      averageOccupancy: Math.round(peakRows[0].avg_occ),
    },
    averageOccupancy: Math.round(avgRows[0]?.avg_occ ?? 0),
    quietestTime: {
      label: formatSlotLabel(quietest.hour, quietest.minute),
      averageOccupancy: Math.round(quietest.avg_occ),
    },
    mostPopularTime: {
      label: formatSlotLabel(popular.hour, popular.minute),
      averageOccupancy: Math.round(popular.avg_occ),
    },
  };
}

function formatSlotLabel(hour: number, minute: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const h = hour % 12 || 12;
  const m = String(minute).padStart(2, "0");
  return `${h}:${m} ${period}`;
}
