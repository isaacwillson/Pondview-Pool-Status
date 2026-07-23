import { POOL_CAPACITY, POOL_CLOSE_HOUR, POOL_OPEN_HOUR } from "./config";
import { currentLocalHour } from "./time";
import type {
  CrowdLevel,
  HourlyActivity,
  PoolConditions,
  PoolDataSnapshot,
  Trend,
} from "./types";

const CAPACITY = POOL_CAPACITY;

/** Map a 0–1 activity score to a categorical crowd level. */
export function activityToCrowdLevel(activity: number): CrowdLevel {
  if (activity < 0.1) return "empty";
  if (activity < 0.35) return "plenty-of-space";
  if (activity < 0.6) return "moderate";
  if (activity < 0.85) return "busy";
  return "very-busy";
}

/** Human-readable label for a crowd level. */
export function crowdLabel(level: CrowdLevel): string {
  switch (level) {
    case "empty":
      return "Empty";
    case "plenty-of-space":
      return "Plenty of Space";
    case "moderate":
      return "Moderate";
    case "busy":
      return "Busy";
    case "very-busy":
      return "Very Busy";
  }
}

/** One-sentence resident-facing description that matches the crowd level. */
export function crowdSubtitle(level: CrowdLevel): string {
  switch (level) {
    case "empty":
      return "The deck is quiet right now — a great time for laps, a sunbath, or a peaceful afternoon by the water.";
    case "plenty-of-space":
      return "The pool is comfortably below capacity — a great time for a swim, with room to spread out on the deck.";
    case "moderate":
      return "The pool is steadily filling — still easy to find a seat and a stretch of open water.";
    case "busy":
      return "The pool is getting crowded — most loungers are taken, though the water still has room.";
    case "very-busy":
      return "The pool is at peak — consider coming back later if you want a relaxed visit.";
  }
}

/** Short label used in compact UI (e.g. chart axis). */
export function crowdLabelShort(level: CrowdLevel): string {
  switch (level) {
    case "empty":
      return "Empty";
    case "plenty-of-space":
      return "Quiet";
    case "moderate":
      return "Moderate";
    case "busy":
      return "Busy";
    case "very-busy":
      return "Very Busy";
  }
}

/**
 * Demo activity curves — one per chart tab, each with its own shape so the
 * Today / Yesterday / Weekly avg. tabs are visibly different in demo mode.
 *
 * AVERAGE: the smooth "typical week" baseline (also feeds the ghost-bar
 * projections the chart draws for future hours on the Today tab).
 */
const AVERAGE_CURVE: number[] = [
  0.02, 0.02, 0.02, 0.02, 0.04, 0.08, 0.14, 0.22, // 12am-7am
  0.28, 0.32, 0.40, 0.50, 0.58, 0.62, 0.66, 0.72, // 8am-3pm
  0.80, 0.92, 0.95, 0.74, 0.42, 0.22, 0.10, 0.05, // 4pm-11pm
];

/** YESTERDAY: a slow morning that builds to a big early-evening peak. */
const YESTERDAY_CURVE: number[] = [
  0.02, 0.02, 0.02, 0.02, 0.03, 0.06, 0.10, 0.16, // 12am-7am
  0.20, 0.21, 0.22, 0.30, 0.35, 0.31, 0.42, 0.55, // 8am-3pm
  0.68, 0.85, 0.97, 0.88, 0.50, 0.26, 0.12, 0.06, // 4pm-11pm
];

/**
 * TODAY: per-hour multipliers applied to the average — a busier-than-usual
 * morning and a deeper midday lull, so today tells its own story.
 */
const TODAY_VS_AVERAGE: number[] = [
  1.0, 1.0, 1.0, 1.0, 1.1, 1.2, 1.25, 1.2, // 12am-7am
  1.3, 1.35, 1.3, 1.15, 0.8, 0.75, 0.9, 1.05, // 8am-3pm
  1.1, 1.0, 0.95, 1.05, 1.1, 1.0, 1.0, 1.0, // 4pm-11pm
];

function toHourly(curve: number[]): HourlyActivity[] {
  return curve.map((activity, hour) => ({
    hour,
    activity,
    label: activityToCrowdLevel(activity),
  }));
}

/**
 * Today's demo curve: readings up to the current pool-local hour, empty
 * after — like a real partial day, so the chart renders confirmed bars for
 * the morning and ghost projections for the rest.
 */
function buildDemoToday(now: Date): HourlyActivity[] {
  const currentHour = Math.floor(currentLocalHour(now));
  return AVERAGE_CURVE.map((avg, hour) => {
    const activity =
      hour > currentHour
        ? 0
        : Math.min(1, Math.round(avg * TODAY_VS_AVERAGE[hour] * 100) / 100);
    return { hour, activity, label: activityToCrowdLevel(activity) };
  });
}

/**
 * Build today's conditions. The temperature / UV values here are
 * placeholders — the live snapshot overrides them with Open-Meteo data
 * (`lib/weather.ts`). Pool open/close are pure integers so they can't
 * pick up the server's timezone by accident.
 */
export function buildConditions(now: Date = new Date()): PoolConditions {
  const hoursLeftToday = Math.max(
    0,
    Math.round((POOL_CLOSE_HOUR - currentLocalHour(now)) * 10) / 10,
  );

  return {
    airTempF: 84,
    waterTempF: 85,
    uvIndex: 7,
    openFromHour: POOL_OPEN_HOUR,
    openUntilHour: POOL_CLOSE_HOUR,
    hoursLeftToday,
  };
}

/**
 * Build a fully-mocked snapshot. Used only as a fallback when there's
 * no database connection (local dev without DATABASE_URL); the live site
 * composes the snapshot from real readings in `pool-data-server.ts`.
 */
export function buildSnapshot(now: Date = new Date()): PoolDataSnapshot {
  const today = buildDemoToday(now);
  // Derive the hero status from today's curve at the current hour so the
  // demo is internally consistent — the headline, occupancy %, and chart
  // all tell the same story.
  const currentHour = Math.min(23, Math.max(0, Math.floor(currentLocalHour(now))));
  const nowActivity = today[currentHour]?.activity ?? 0;
  const prevActivity = today[Math.max(0, currentHour - 1)]?.activity ?? 0;
  const trend: Trend =
    nowActivity - prevActivity > 0.03
      ? "rising"
      : prevActivity - nowActivity > 0.03
        ? "falling"
        : "steady";
  const occupancy = Math.round(nowActivity * CAPACITY);
  const lastUpdated = new Date(now.getTime() - 2 * 60_000);

  return {
    status: {
      crowdLevel: activityToCrowdLevel(nowActivity),
      occupancy,
      capacity: CAPACITY,
      lastUpdated,
      trend,
    },
    conditions: buildConditions(now),
    hourlyActivity: {
      today,
      yesterday: toHourly(YESTERDAY_CURVE),
      average: toHourly(AVERAGE_CURVE),
    },
    weeklyUsage: {
      peakDay: { day: "Saturday", averageOccupancy: 47 },
      averageOccupancy: 23,
      quietestTime: { label: "10:30 AM", averageOccupancy: 4 },
      mostPopularTime: { label: "6:30 PM", averageOccupancy: 41 },
      // Per weekday (Sun…Sat); untracked days are 0, Saturday is the peak.
      dailyAverages: [0, 0, 24, 31, 38, 0, 47],
    },
  };
}
