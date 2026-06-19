/**
 * Single source of truth for pool configuration values that don't
 * belong in a database row. Keep this list short; anything that needs
 * to change without a deploy belongs in Redis or Postgres instead.
 */

export const POOL_CAPACITY = 60;

/**
 * IANA timezone for the pool's physical location. Used to bucket
 * readings into local hours/days so a guest visiting at "8 AM Austin"
 * lands in the 8 AM bucket regardless of the server's clock.
 */
export const POOL_TIMEZONE = "America/New_York";

/** Coordinates used to fetch weather (air temperature, UV index). */
export const POOL_LAT = 40.898;
export const POOL_LON = 74.5719;

/** Pool open hours in 24-hour local time (used to filter aggregates). */
export const POOL_OPEN_HOUR = 10;
export const POOL_CLOSE_HOUR = 20;

/** Reading cadence the camera is expected to use (5 minutes). */
export const SENSOR_INTERVAL_MS = 5 * 60_000;

/**
 * How long after the latest reading we still consider the data "fresh".
 * Older than this and the live status falls back to the empty state.
 */
export const FRESH_READING_WINDOW_MS = 30 * 60_000;

/**
 * Window of recent readings used to compute the trend ("rising" vs
 * "falling"). 30 minutes ≈ 6 readings at the 5-minute cadence.
 */
export const TREND_WINDOW_MS = 30 * 60_000;

/**
 * Historical aggregates need at least this many distinct calendar days
 * of data before the "This Week's Usage" cards graduate from the
 * "Not enough data yet" placeholder.
 */
export const WEEKLY_USAGE_MIN_DAYS = 7;
