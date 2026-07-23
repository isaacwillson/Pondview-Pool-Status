/**
 * Domain types for the Pondview Pool Status dashboard.
 *
 * These shapes mirror what a real occupancy data source
 * (e.g. computer vision sensor, RFID gate, or aggregated mobile
 * presence) would emit. Swapping the mock provider for a live
 * data source should not require changes to UI components.
 */

export type CrowdLevel =
  | "empty"
  | "plenty-of-space"
  | "moderate"
  | "busy"
  | "very-busy";

export type Trend = "rising" | "steady" | "falling";

export interface PoolStatus {
  /** Categorical crowd level — drives the headline color & label. */
  crowdLevel: CrowdLevel;
  /** Estimated number of people currently at the pool. */
  occupancy: number;
  /** Total capacity for the amenity. */
  capacity: number;
  /** When the underlying sensor reading was taken. */
  lastUpdated: Date;
  /** Direction occupancy is moving over the last ~30 minutes. */
  trend: Trend;
}

export interface PoolConditions {
  /** Air temperature in °F. */
  airTempF: number;
  /** Pool water temperature in °F. */
  waterTempF: number;
  /** UV index, 0–11+. */
  uvIndex: number;
  /** Hour the pool opens (0–23) in the pool's local time. */
  openFromHour: number;
  /** Hour the pool closes (0–23) in the pool's local time. */
  openUntilHour: number;
  /** Hours remaining until close today, computed in the pool's timezone. */
  hoursLeftToday: number;
}

export interface HourlyActivity {
  /** Hour in 24-hour clock (0–23). */
  hour: number;
  /** Normalized activity 0–1. */
  activity: number;
  /** Human-friendly label (e.g. "Quiet", "Busy"). */
  label: CrowdLevel;
}

/** The three time periods the "Best Times to Visit" chart can show. */
export interface HourlyActivitySet {
  /** Today's readings so far, hour-by-hour. null if no readings today. */
  today: HourlyActivity[] | null;
  /** Yesterday's calendar day, hour-by-hour. null if no data for yesterday. */
  yesterday: HourlyActivity[] | null;
  /** Rolling 7-day average per hour-of-day. null if no recent readings. */
  average: HourlyActivity[] | null;
}

export interface WeeklyUsage {
  peakDay: { day: string; averageOccupancy: number };
  averageOccupancy: number;
  quietestTime: { label: string; averageOccupancy: number };
  mostPopularTime: { label: string; averageOccupancy: number };
  /**
   * Average occupancy per weekday over the trailing week, indexed by JS
   * weekday (0 = Sunday … 6 = Saturday). Untracked days are 0. Drives the
   * Peak Day sparkline.
   */
  dailyAverages: number[];
}

export interface PoolDataSnapshot {
  /** null if no readings have ever arrived from the sensor. */
  status: PoolStatus | null;
  /** Static-ish conditions (weather, hours). Always present. */
  conditions: PoolConditions;
  /** Three time-period datasets for the chart. null if no readings at all. */
  hourlyActivity: HourlyActivitySet | null;
  /** null if fewer than 7 calendar days of recent readings. */
  weeklyUsage: WeeklyUsage | null;
}
