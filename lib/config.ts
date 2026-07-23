/**
 * Single source of truth for pool configuration values that don't
 * belong in a database row. Keep this list short; anything that needs
 * to change without a deploy belongs in Redis or Postgres instead.
 */

export const POOL_CAPACITY = 80;

/**
 * IANA timezone for the pool's physical location. Used to bucket
 * readings into local hours/days so a guest visiting at "8 AM Austin"
 * lands in the 8 AM bucket regardless of the server's clock.
 */
export const POOL_TIMEZONE = "America/New_York";

/** Coordinates used to fetch weather (air temperature, UV index). */
export const POOL_LAT = 40.898;
export const POOL_LON = -74.5719;

/** Pool open hours in 24-hour local time (used to filter aggregates). */
export const POOL_OPEN_HOUR = 10;
export const POOL_CLOSE_HOUR = 20;

/**
 * Days of the week occupancy is actively tracked, as JS weekday indices
 * (0 = Sunday … 6 = Saturday). The pool is open every day during POOL_OPEN
 * hours, but crowd levels are only measured on these days. On other days the
 * dashboard shows an "open, but not tracked today" state instead of a number.
 *
 * When the camera comes online and tracks every day, set this to
 * [0, 1, 2, 3, 4, 5, 6] and all the "untracked day" messaging disappears.
 */
export const POOL_TRACKING_DAYS = [2, 3, 4, 6]; // Tue, Wed, Thu, Sat

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
 * "This Week's Usage" graduates from its "Not enough data yet" placeholder
 * once at least WEEKLY_USAGE_MIN_DAYS distinct days within the last
 * WEEKLY_USAGE_WINDOW_DAYS have readings. The threshold is lower than the
 * window because the pool is only tracked a few days a week (see
 * POOL_TRACKING_DAYS) — requiring all 7 would mean the card never appears.
 */
export const WEEKLY_USAGE_WINDOW_DAYS = 7;
export const WEEKLY_USAGE_MIN_DAYS = 3;
