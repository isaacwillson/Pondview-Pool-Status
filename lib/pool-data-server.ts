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
  getAverageHourlyActivity,
  getLatestReading,
  getTodayHourlyActivity,
  getTrend,
  getWeeklyUsage,
  getYesterdayHourlyActivity,
} from "./occupancy-history";
import type {
  HourlyActivitySet,
  PoolDataSnapshot,
  PoolStatus,
} from "./types";
import { getWeather } from "./weather";
import { FRESH_READING_WINDOW_MS } from "./config";

export async function buildLiveSnapshot(
  now: Date = new Date(),
): Promise<PoolDataSnapshot> {
  const [
    latest,
    trend,
    today,
    yesterday,
    average,
    weeklyUsage,
    weather,
  ] = await Promise.all([
    getLatestReading(),
    getTrend(),
    getTodayHourlyActivity(),
    getYesterdayHourlyActivity(),
    getAverageHourlyActivity(),
    getWeeklyUsage(),
    getWeather(),
  ]);

  // Roll the three datasets into one object. If literally none of them have
  // data, hand the chart `null` so it renders its "Not enough data yet" card.
  const hourlyActivity: HourlyActivitySet | null =
    today || yesterday || average
      ? { today, yesterday, average }
      : null;

  // Only treat a reading as "live" if it's recent. Otherwise (overnight gaps,
  // and especially the days we don't track) a hours-or-days-old reading would
  // be shown as the current crowd level. A stale reading → no live status, and
  // the hero picks the right "no live data" state instead.
  const isFresh =
    latest !== null &&
    now.getTime() - latest.recordedAt.getTime() <= FRESH_READING_WINDOW_MS;

  let status: PoolStatus | null = null;
  if (latest && isFresh) {
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
