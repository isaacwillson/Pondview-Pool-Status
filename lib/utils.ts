import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Percentage of capacity currently used, rounded to a whole number. */
export function pctFull(count: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((count / capacity) * 100)));
}

export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);

  if (diffSec < 30) return "Just now";
  if (diffMin < 1) return `${diffSec} seconds ago`;
  if (diffMin === 1) return "1 minute ago";
  if (diffMin < 60) return `${diffMin} minutes ago`;
  if (diffHr === 1) return "1 hour ago";
  if (diffHr < 24) return `${diffHr} hours ago`;
  return date.toLocaleDateString();
}
