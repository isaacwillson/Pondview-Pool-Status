/**
 * Combine the admin override (Upstash) with the configured open hours
 * (`POOL_OPEN_HOUR` / `POOL_CLOSE_HOUR`) into a single "what should the
 * resident actually see" state.
 *
 * Precedence:
 *   1. Admin force-close (`isOpen: false`) — overrides everything.
 *   2. Pool schedule — closed outside open hours.
 *   3. Open.
 *
 * The admin's `isOpen: true` is *not* an override; it just means
 * "no special closure" — the schedule still decides.
 */
import { POOL_CLOSE_HOUR, POOL_OPEN_HOUR } from "./config";
import type { AdminPoolStatus } from "./pool-status";
import { currentLocalHour, formatHourLabel } from "./time";

export type EffectiveSource = "admin" | "schedule" | null;

export interface EffectivePoolStatus {
  isOpen: boolean;
  /** Short, resident-facing reason for closure. `null` when open. */
  closedReason: string | null;
  /**
   * What's driving the current closed state.
   *   "admin"    – admin force-closed it
   *   "schedule" – outside the configured open hours
   *   null       – pool is open
   */
  closedBy: EffectiveSource;
  /** Pass-through of the underlying admin record (e.g. for timestamps). */
  adminStatus: AdminPoolStatus | null;
}

interface DeriveOpts {
  now?: Date;
  openFromHour?: number;
  openUntilHour?: number;
}

export function deriveEffectivePoolStatus(
  adminStatus: AdminPoolStatus | null,
  { now = new Date(), openFromHour = POOL_OPEN_HOUR, openUntilHour = POOL_CLOSE_HOUR }: DeriveOpts = {},
): EffectivePoolStatus {
  if (adminStatus?.isOpen === false) {
    return {
      isOpen: false,
      closedReason: adminStatus.reason ?? "Pool currently closed",
      closedBy: "admin",
      adminStatus,
    };
  }

  const hour = currentLocalHour(now);
  if (hour < openFromHour) {
    return {
      isOpen: false,
      closedReason: `Opens today at ${formatHourLabel(openFromHour)}`,
      closedBy: "schedule",
      adminStatus,
    };
  }
  if (hour >= openUntilHour) {
    return {
      isOpen: false,
      closedReason: `Opens tomorrow at ${formatHourLabel(openFromHour)}`,
      closedBy: "schedule",
      adminStatus,
    };
  }

  return {
    isOpen: true,
    closedReason: null,
    closedBy: null,
    adminStatus,
  };
}
