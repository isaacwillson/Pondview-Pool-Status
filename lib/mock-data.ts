import { POOL_CAPACITY, POOL_CLOSE_HOUR, POOL_OPEN_HOUR } from "./config";
import { currentLocalHour } from "./time";
import type {
  CrowdLevel,
  HourlyActivity,
  PoolConditions,
  PoolDataSnapshot,
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
 * Activity curve roughly matching how a luxury apartment pool fills:
 * early-morning lap swimmers, mid-day families, an after-work peak, then quiet.
 */
const ACTIVITY_CURVE: number[] = [
  0.02, 0.02, 0.02, 0.02, 0.04, 0.08, 0.14, 0.22, // 12am-7am
  0.28, 0.32, 0.40, 0.50, 0.58, 0.62, 0.66, 0.72, // 8am-3pm
  0.80, 0.92, 0.95, 0.74, 0.42, 0.22, 0.10, 0.05, // 4pm-11pm
];

export function buildHourlyActivity(): HourlyActivity[] {
  return ACTIVITY_CURVE.map((activity, hour) => ({
    hour,
    activity,
    label: activityToCrowdLevel(activity),
  }));
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
    waterTempF: 81,
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
  const occupancy = 12;
  const lastUpdated = new Date(now.getTime() - 2 * 60_000);

  return {
    status: {
      crowdLevel: "plenty-of-space",
      occupancy,
      capacity: CAPACITY,
      lastUpdated,
      trend: "rising",
    },
    conditions: buildConditions(now),
    hourlyActivity: buildHourlyActivity(),
    weeklyUsage: {
      peakDay: { day: "Saturday", averageOccupancy: 47 },
      averageOccupancy: 23,
      quietestTime: { label: "10:30 AM", averageOccupancy: 4 },
      mostPopularTime: { label: "6:30 PM", averageOccupancy: 41 },
    },
  };
}
