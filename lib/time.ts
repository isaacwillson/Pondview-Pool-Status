/**
 * Tiny time helpers that always work in the pool's local timezone,
 * regardless of where the server (or browser) happens to be running.
 */
import { POOL_TIMEZONE, POOL_TRACKING_DAYS } from "./config";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Current hour of day (0–24) with fractional minutes, in pool-local time. */
export function currentLocalHour(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: POOL_TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  // Some platforms emit "24" at midnight; normalise.
  return (hour % 24) + minute / 60;
}

/** 0-23 → "10 AM" / "8 PM". Pure arithmetic; no Date, no timezone math. */
export function formatHourLabel(hour: number): string {
  const period = hour < 12 || hour === 24 ? "AM" : "PM";
  const h = hour % 12 || 12;
  return `${h} ${period}`;
}

// ---------------------------------------------------------------------------
// Weekday / tracking-day helpers
// ---------------------------------------------------------------------------

/** Day of week (0 = Sunday … 6 = Saturday) in the pool's local timezone. */
export function currentLocalWeekday(now: Date = new Date()): number {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: POOL_TIMEZONE,
    weekday: "short",
  }).format(now);
  return WEEKDAY_SHORT.indexOf(short);
}

/** Whether occupancy is tracked today (see POOL_TRACKING_DAYS). */
export function isTrackingDay(now: Date = new Date()): boolean {
  return POOL_TRACKING_DAYS.includes(currentLocalWeekday(now));
}

/** Weekday index of the next tracking day after today (wraps within a week). */
export function nextTrackingDay(now: Date = new Date()): number {
  const today = currentLocalWeekday(now);
  for (let i = 1; i <= 7; i++) {
    const day = (today + i) % 7;
    if (POOL_TRACKING_DAYS.includes(day)) return day;
  }
  return today;
}

/** "Tuesday" for a 0–6 weekday index. */
export function weekdayLongName(day: number): string {
  return WEEKDAY_LONG[day] ?? "";
}

/**
 * Human list of the tracking days, e.g. "Tue, Wed, Thu & Sat". Derived from
 * POOL_TRACKING_DAYS so it stays correct if the schedule changes.
 */
export function formatTrackingDays(): string {
  const names = POOL_TRACKING_DAYS.slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_SHORT[d]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}
