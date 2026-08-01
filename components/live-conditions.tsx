"use client";

import {
  Clock,
  Sun,
  Thermometer,
  TrendingDown,
  TrendingUp,
  Umbrella,
  Users,
} from "lucide-react";
import { Card } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { cn, pctFull } from "@/lib/utils";
import { crowdLabel } from "@/lib/mock-data";
import {
  deriveEffectivePoolStatus,
  type EffectivePoolStatus,
} from "@/lib/effective-status";
import type { AdminPoolStatus } from "@/lib/pool-status";
import {
  formatHourLabel,
  formatTrackingDays,
  isTrackingDay,
} from "@/lib/time";
import type { PoolConditions, PoolStatus, UmbrellaZone } from "@/lib/types";

interface LiveConditionsProps {
  status: PoolStatus | null;
  conditions: PoolConditions | null;
  umbrellas: UmbrellaZone[] | null;
  adminStatus: AdminPoolStatus | null;
  isLoading: boolean;
}

export function LiveConditions({
  status,
  conditions,
  umbrellas,
  adminStatus,
  isLoading,
}: LiveConditionsProps) {
  // Conditions (weather, pool hours) are always present once the snapshot
  // arrives. If we don't have them yet, we're either loading or the API
  // hard-failed — show the loading skeleton in either case.
  if (!conditions) return <LiveConditionsSkeleton />;

  const effective = deriveEffectivePoolStatus(adminStatus);
  const closed = !effective.isOpen;
  // Open, no fresh reading, and today isn't a tracking day → the pool is open
  // but we're deliberately not measuring crowd levels.
  const untracked = !closed && !status && !isLoading && !isTrackingDay();
  const occupancyPct = status
    ? pctFull(status.occupancy, status.capacity)
    : 0;

  // No reading + open → "Awaiting first reading" (or loading shimmer
  // briefly during the very first fetch).
  const crowdPrimary = closed
    ? "Closed"
    : status
      ? crowdLabel(status.crowdLevel)
      : isLoading
        ? "…"
        : untracked
          ? "Not tracked"
          : "Awaiting reading";
  const crowdSecondary = closed
    ? effective.closedReason ?? "Pool currently closed"
    : status
      ? `${occupancyPct}% full`
      : isLoading
        ? "Connecting…"
        : untracked
          ? "Live tracking off today"
          : "No readings yet";
  const crowdAccent: "emerald" | "amber" | "pond" = closed
    ? "amber"
    : status
      ? "emerald"
      : "pond";
  const crowdMuted = !closed && !status;

  const trendPrimary = status ? trendDisplay(status.trend) : "—";
  const trendSecondary = closed
    ? "Check back during open hours"
    : status
      ? trendSubtitle(status)
      : isLoading
        ? "Connecting…"
        : untracked
          ? "Off today"
          : "Available after a few readings";
  const trendMuted = closed || !status;

  return (
    <section aria-labelledby="conditions-heading">
      <SectionHeading
        eyebrow=""
        title="Live Pool Conditions"
        subtitle="Updated continuously from on-site sensors."
        id="conditions-heading"
      />

      <div className="mt-8 grid grid-cols-2 gap-4 stagger lg:grid-cols-6">
        {/* Row 1: Crowd + Trend (related pair) */}
        <ConditionCard
          icon={<Users className="h-4 w-4" />}
          label="Crowd Level"
          primary={crowdPrimary}
          secondary={crowdSecondary}
          accent={crowdAccent}
          muted={crowdMuted}
          className="lg:col-span-3"
        />
        <ConditionCard
          icon={
            status?.trend === "falling" ? (
              <TrendingDown className="h-4 w-4" />
            ) : (
              <TrendingUp className="h-4 w-4" />
            )
          }
          label="Trend"
          primary={trendPrimary}
          secondary={trendSecondary}
          accent="pond"
          muted={trendMuted}
          faded={closed || untracked}
          className="lg:col-span-3"
        />
        {/* Row 2: Temperature + UV (related pair) */}
        <ConditionCard
          icon={<Thermometer className="h-4 w-4" />}
          label="Air Temperature"
          primary={`${conditions.airTempF}°F`}
          secondary={`Water ${conditions.waterTempF}°F`}
          accent="rose"
          className="lg:col-span-3"
        />
        <ConditionCard
          icon={<Sun className="h-4 w-4" />}
          label="UV Index"
          primary={`${conditions.uvIndex}`}
          secondary={uvSecondary(conditions.uvIndex)}
          accent="amber"
          className="lg:col-span-3"
        />
        {/* Shade — per-zone umbrella availability, only when there's a live
            count (hidden rather than showing a hollow card, to avoid clutter). */}
        {!closed && umbrellas && umbrellas.length > 0 ? (
          <ShadeCard zones={umbrellas} />
        ) : null}

        {/* Row 3: Pool Hours — full width anchor */}
        <ConditionCard
          icon={<Clock className="h-4 w-4" />}
          label="Pool Hours"
          primary={`${formatHourLabel(conditions.openFromHour)} – ${formatHourLabel(conditions.openUntilHour)}`}
          secondary={hoursSecondary(effective, conditions)}
          note={`Crowd levels tracked ${formatTrackingDays()}`}
          accent="pond"
          className="col-span-2 lg:col-span-6"
        />
      </div>
    </section>
  );
}

interface ConditionCardProps {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary: string;
  accent: "emerald" | "amber" | "rose" | "pond";
  muted?: boolean;
  /** De-emphasize the whole card (e.g. when it carries no info while closed). */
  faded?: boolean;
  /** Optional small footnote under the value (e.g. the tracking schedule). */
  note?: string;
  className?: string;
}

const ACCENT_STYLES = {
  emerald: { iconBg: "bg-emerald-50 text-emerald-600", glow: "from-emerald-200/40" },
  amber: { iconBg: "bg-amber-50 text-amber-600", glow: "from-amber-200/40" },
  rose: { iconBg: "bg-rose-50 text-rose-600", glow: "from-rose-200/40" },
  pond: { iconBg: "bg-pond-50 text-pond-600", glow: "from-pond-200/40" },
};

function ConditionCard({
  icon,
  label,
  primary,
  secondary,
  accent,
  muted,
  faded,
  note,
  className,
}: ConditionCardProps) {
  const s = ACCENT_STYLES[accent];
  return (
    <Card
      className={cn(
        "group relative overflow-hidden p-5 transition-all duration-300",
        // Drop the hover lift when faded — a card with no info shouldn't invite interaction.
        // (Opacity lives on the inner wrapper below: the card itself is a `.stagger`
        //  child whose fade-in animation would otherwise clobber a card-level opacity.)
        !faded &&
          "hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(20,37,49,0.04),0_18px_36px_-18px_rgba(20,37,49,0.18)]",
        className,
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-radial blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100",
          "bg-gradient-to-br",
          s.glow,
          "to-transparent",
        )}
        aria-hidden
      />
      <div className={cn("relative transition-opacity duration-300", faded && "opacity-50")}>
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            s.iconBg,
          )}
          aria-hidden
        >
          {icon}
        </span>
        <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            "mt-1.5 font-display text-3xl font-normal leading-tight tracking-tight",
            muted ? "text-muted-foreground/50" : "text-foreground",
          )}
        >
          {primary}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{secondary}</p>
        {note ? (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-secondary/70 px-2.5 py-1 text-xs text-muted-foreground">
            {note}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Full-width shade card: umbrellas free, split by zone so a resident wanting
 * the main pool isn't misled by shade that's only free at the kitty pool.
 */
function ShadeCard({ zones }: { zones: UmbrellaZone[] }) {
  return (
    <Card className="col-span-2 p-5 lg:col-span-6">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-pond-50 text-pond-600"
          aria-hidden
        >
          <Umbrella className="h-4 w-4" />
        </span>
        <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
          Shade · umbrellas free
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        {zones.map((z) => {
          const free = Math.max(0, z.total - z.inUse);
          const usedPct = z.total > 0 ? (z.inUse / z.total) * 100 : 0;
          return (
            <div key={z.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-foreground">
                  {z.label}
                </span>
                <span className="text-sm tabular-nums text-muted-foreground">
                  <span
                    className={cn(
                      "font-semibold",
                      free === 0 ? "text-rose-600" : "text-foreground",
                    )}
                  >
                    {free}
                  </span>{" "}
                  of {z.total} free
                </span>
              </div>
              <div
                className="mt-2 h-2 w-full overflow-hidden rounded-full bg-pond-100"
                role="img"
                aria-label={`${z.label}: ${free} of ${z.total} umbrellas free`}
              >
                <div
                  className="h-full rounded-full bg-pond-500 transition-[width] duration-700"
                  style={{ width: `${usedPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
  id,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  id?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {eyebrow}
      </p>
      <h2
        id={id}
        className="mt-3 font-display text-3xl font-normal leading-tight tracking-tight text-foreground sm:text-4xl"
      >
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-3 max-w-xl text-base text-muted-foreground">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function trendDisplay(t: PoolStatus["trend"]) {
  switch (t) {
    case "rising":
      return "Getting Busier";
    case "falling":
      return "Getting Quieter";
    default:
      return "Steady";
  }
}

function trendSubtitle(status: PoolStatus) {
  if (status.trend === "steady") return "No change in last 30 min";
  const sign = status.trend === "rising" ? "+" : "−";
  const abs = Math.abs(status.trendDeltaPct);
  // Below a full point the rounded value can read "0"; show "<1%" so the
  // magnitude never contradicts the "Getting Busier/Quieter" headline.
  const magnitude = abs >= 1 ? `${sign}${abs}%` : `${sign}<1%`;
  return `${magnitude} in last 30 min`;
}

function uvLabel(uv: number) {
  if (uv <= 2) return "Low";
  if (uv <= 5) return "Moderate";
  if (uv <= 7) return "High";
  if (uv <= 10) return "Very High";
  return "Extreme";
}

/** Sub-label for the UV card — avoids the redundant "0 / Low" pairing. */
function uvSecondary(uv: number) {
  if (uv === 0) return "No sun protection needed";
  return uvLabel(uv);
}

function hoursSecondary(
  effective: EffectivePoolStatus,
  conditions: PoolConditions,
): string {
  if (effective.isOpen) {
    return `${conditions.hoursLeftToday} hours left today`;
  }
  if (effective.closedBy === "admin") {
    return "Closed by management";
  }
  // Schedule-driven closure — reuse the helper's friendly reason.
  return effective.closedReason ?? "Currently closed";
}

function LiveConditionsSkeleton() {
  return (
    <section>
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-72" />
      </div>
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-6">
        {[
          "lg:col-span-3",
          "lg:col-span-3",
          "lg:col-span-3",
          "lg:col-span-3",
          "col-span-2 lg:col-span-6",
        ].map((span, i) => (
          <Card key={i} className={cn("p-5", span)}>
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="mt-5 h-3 w-24" />
            <Skeleton className="mt-2 h-7 w-32" />
            <Skeleton className="mt-2 h-4 w-24" />
          </Card>
        ))}
      </div>
    </section>
  );
}
