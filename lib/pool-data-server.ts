/**
 * Builds the resident-facing `PoolDataSnapshot` by combining:
 *   - real occupancy readings from Postgres (status, trend, hourly, weekly)
 *   - statically-mocked conditions (temps, UV, pool hours)
 *
 * Any historical aggregate that doesn't have enough data is returned
 * as `null` so the UI can render the "Not enough data yet" placeholder.
 */
import "server-only";
import { activityToCrowdLevel, buildConditions } from "./mock-data";
import {
  getLatestReading,
  getTodayHourlyActivity,
  getTrend,
  getWeeklyUsage,
} from "./occupancy-history";
import type { PoolDataSnapshot, PoolStatus } from "./types";
import { getWeather } from "./weather";

export async function buildLiveSnapshot(
  now: Date = new Date(),
): Promise<PoolDataSnapshot> {
  const [latest, trend, hourlyActivity, weeklyUsage, weather] = await Promise.all([
    getLatestReading(),
    getTrend(),
    getTodayHourlyActivity(),
    getWeeklyUsage(),
    getWeather(),
  ]);

  let status: PoolStatus | null = null;
  if (latest) {
    const activity = latest.occupancy / Math.max(1, latest.capacity);
    status = {
      crowdLevel: activityToCrowdLevel(activity),
      occupancy: latest.occupancy,
      capacity: latest.capacity,
      lastUpdated: latest.recordedAt,
      trend,
    };
  }

  const conditions = buildConditions(now);
  conditions.airTempF = weather.airTempF;
  conditions.uvIndex = weather.uvIndex;

  return {
    status,
    conditions,
    hourlyActivity,
    weeklyUsage,
  };
}
