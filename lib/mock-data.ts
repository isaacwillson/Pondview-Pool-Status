import type {
  CrowdLevel,
  HourlyActivity,
  PoolDataSnapshot,
} from "./types";

const CAPACITY = 60;

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

/** Build a fresh snapshot of the dashboard's mock data. */
export function buildSnapshot(now: Date = new Date()): PoolDataSnapshot {
  const occupancy = 12;
  const lastUpdated = new Date(now.getTime() - 2 * 60_000);
  const openFrom = new Date(now);
  openFrom.setHours(10, 0, 0, 0);
  const openUntil = new Date(now);
  openUntil.setHours(20, 0, 0, 0);

  return {
    status: {
      crowdLevel: "plenty-of-space",
      occupancy,
      capacity: CAPACITY,
      lastUpdated,
      trend: "rising",
    },
    conditions: {
      airTempF: 84,
      waterTempF: 81,
      uvIndex: 7,
      openFrom,
      openUntil,
    },
    hourlyActivity: buildHourlyActivity(),
    weeklyUsage: {
      peakDay: { day: "Saturday", averageOccupancy: 47 },
      averageOccupancy: 23,
      quietestTime: { label: "10:30 AM", averageOccupancy: 4 },
      mostPopularTime: { label: "6:30 PM", averageOccupancy: 41 },
    },
  };
}
