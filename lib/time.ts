/**
 * Tiny time helpers that always work in the pool's local timezone,
 * regardless of where the server (or browser) happens to be running.
 */
import { POOL_TIMEZONE } from "./config";

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
