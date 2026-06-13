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

export type Confidence = "low" | "medium" | "high";

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
  /** Sensor / model confidence in the current reading. */
  confidence: Confidence;
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
  /** Pool opening time as a Date for today. */
  openFrom: Date;
  /** Pool closing time as a Date for today. */
  openUntil: Date;
}

export interface HourlyActivity {
  /** Hour in 24-hour clock (0–23). */
  hour: number;
  /** Normalized activity 0–1. */
  activity: number;
  /** Human-friendly label (e.g. "Quiet", "Busy"). */
  label: CrowdLevel;
}

export interface WeeklyUsage {
  peakDay: { day: string; averageOccupancy: number };
  averageOccupancy: number;
  quietestTime: { label: string; averageOccupancy: number };
  mostPopularTime: { label: string; averageOccupancy: number };
}

export interface PoolDataSnapshot {
  status: PoolStatus;
  conditions: PoolConditions;
  hourlyActivity: HourlyActivity[];
  weeklyUsage: WeeklyUsage;
}
