"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Clock, Lock, WifiOff } from "lucide-react";
import posthog from "posthog-js";
import { LivePulse } from "./live-pulse";
import { AnimatedNumber } from "./animated-number";
import { Skeleton } from "./ui/skeleton";
import { Badge } from "./ui/badge";
import { cn, formatRelativeTime, pctFull } from "@/lib/utils";
import type { CrowdLevel, HourlyActivity, PoolStatus } from "@/lib/types";
import type { AdminPoolStatus } from "@/lib/pool-status";
import {
  deriveEffectivePoolStatus,
  type EffectivePoolStatus,
} from "@/lib/effective-status";
import { activityToCrowdLevel, crowdLabel, crowdSubtitle } from "@/lib/mock-data";
import {
  currentLocalHour,
  formatHourLabel,
  formatTrackingDays,
  isTrackingDay,
  nextTrackingDay,
  weekdayLongName,
} from "@/lib/time";
import { POOL_CLOSE_HOUR, POOL_OPEN_HOUR } from "@/lib/config";

interface HeroStatusProps {
  status: PoolStatus | null;
  adminStatus: AdminPoolStatus | null;
  isLoading: boolean;
  weeklyAverage: HourlyActivity[] | null;
  /** Whether any reading has been recorded for today (distinguishes a
   *  just-opened day from a mid-day tracking gap). */
  todayHasReadings: boolean;
}

export function HeroStatus({
  status,
  adminStatus,
  isLoading,
  weeklyAverage,
  todayHasReadings,
}: HeroStatusProps) {
  // Refresh relative-time strings and recompute the schedule branch.
  const [, force] = useState(0);
  useEffect(() => {
    const i = setInterval(() => force((x) => x + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  // Fire pool_status_viewed once when live occupancy data arrives — top of resident funnel.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (status && !viewedRef.current) {
      viewedRef.current = true;
      posthog.capture("pool_status_viewed", {
        crowd_level: status.crowdLevel,
        occupancy_pct: Math.round((status.occupancy / status.capacity) * 100),
      });
    }
  }, [status]);

  const effective = deriveEffectivePoolStatus(adminStatus);

  // Outside open hours / admin-closed.
  if (!effective.isOpen) {
    return (
      <HeroShell compact>
        <ClosedHero effective={effective} />
      </HeroShell>
    );
  }

  // Open with a fresh reading — the normal live view.
  if (status) {
    return (
      <HeroShell>
        <LiveHero status={status} weeklyAverage={weeklyAverage} />
      </HeroShell>
    );
  }

  if (isLoading) return <HeroStatusSkeleton />;

  // Open, but no fresh reading. Why depends on whether today is tracked.
  if (!isTrackingDay()) {
    return (
      <HeroShell compact>
        <UntrackedHero />
      </HeroShell>
    );
  }

  // A tracking day with no fresh reading: a just-opened day starts empty;
  // otherwise today had readings that have since gone stale.
  return (
    <HeroShell compact>
      {todayHasReadings ? <PausedHero /> : <JustOpenedHero />}
    </HeroShell>
  );
}

// ---------------------------------------------------------------------------
// Shell: shared gradient card with the decorative pattern overlay
// ---------------------------------------------------------------------------

function HeroShell({
  children,
  compact,
}: {
  children: React.ReactNode;
  compact?: boolean;
  tint?: CrowdLevel;
}) {


  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-white/70",
        "hero-gradient shadow-[0_2px_4px_rgba(20,37,49,0.04),0_24px_64px_-24px_rgba(20,37,49,0.18)]",
        "animate-scale-in",
      )}
      aria-labelledby="hero-status-heading"
    >
      
      <svg
        className="pointer-events-none absolute -right-12 -top-12 h-72 w-72 text-pond-200/40"
        viewBox="0 0 200 200"
        fill="none"
        aria-hidden
      >
        <defs>
          <pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.2" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="200" height="200" fill="url(#dots)" />
      </svg>
      <div
        className={cn(
          "relative grid gap-12 p-8 sm:p-12 lg:p-16",
          compact
            ? "lg:grid-cols-1"
            : "lg:grid-cols-[1.1fr_0.9fr] lg:gap-0 lg:divide-x lg:divide-border/50",
        )}
      >
        {children}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Live hero — we have a real sensor reading.
// ---------------------------------------------------------------------------

function LiveHero({
  status,
  weeklyAverage,
}: {
  status: PoolStatus;
  weeklyAverage: HourlyActivity[] | null;
}) {
  const occupancyPct = pctFull(status.occupancy, status.capacity);

  return (
    <>
      <div className="flex flex-col justify-between lg:pr-8">
        <div>
          <Eyebrow icon={<LivePulse />}>Live · Pool Status</Eyebrow>
          <Headline>{crowdLabel(status.crowdLevel)}</Headline>
          <Subtitle>{crowdSubtitle(status.crowdLevel)}</Subtitle>
        </div>
        <QuieterHint weeklyAverage={weeklyAverage} currentLevel={status.crowdLevel} />
      </div>

      <div className="flex flex-col justify-between gap-10 lg:pl-8">
        <div>
          <SmallLabel>Estimated Occupancy</SmallLabel>
          <div className="mt-4 flex items-baseline gap-3">
            <span
              aria-label={`${occupancyPct} percent full`}
              className="font-display text-[clamp(5rem,12vw,8.5rem)] font-normal leading-none tracking-tight text-foreground"
            >
              <AnimatedNumber value={occupancyPct} />
              <span className="text-[0.55em] text-pond-600">%</span>
            </span>
            <span className="font-display text-2xl italic text-muted-foreground">
              full
            </span>
          </div>
          <CapacityBar occupancyPct={occupancyPct} />
        </div>
        <MetaRow updatedValue={formatRelativeTime(status.lastUpdated)} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Closed hero — admin has flipped the pool to closed.
// ---------------------------------------------------------------------------

function ClosedHero({ effective }: { effective: EffectivePoolStatus }) {
  const byAdmin = effective.closedBy === "admin";
  const eyebrowLabel = byAdmin ? "Closed by management" : "Outside pool hours";
  const adminUpdatedValue = effective.adminStatus?.lastChangedAt
    ? formatRelativeTime(new Date(effective.adminStatus.lastChangedAt))
    : "Now";

  return (
    <div className="flex flex-col">
      <Eyebrow
        icon={
          byAdmin ? (
            <Lock className="h-3.5 w-3.5 text-amber-600" aria-hidden />
          ) : (
            <span
              className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white/70"
              aria-hidden
            />
          )
        }
      >
        {eyebrowLabel}
      </Eyebrow>
      <Headline>Closed</Headline>
      <Subtitle>
        {effective.closedReason ??
          "The pool is currently closed. Please check back later."}
      </Subtitle>
      {byAdmin ? (
        <div className="mt-12 max-w-xl">
          <MetaRow
            updatedValue={adminUpdatedValue}
            sourceLabel="Status set by"
            sourceValue="Property management"
          />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Untracked-day hero — pool is OPEN, but today isn't a tracking day.
// ---------------------------------------------------------------------------

function UntrackedHero() {
  const nextDay = weekdayLongName(nextTrackingDay());

  return (
    <div className="flex flex-col">
      <Eyebrow
        icon={
          <span
            className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white/70"
            aria-hidden
          />
        }
      >
        Open · live tracking off today
      </Eyebrow>
      <Headline>Open</Headline>
      <Subtitle>
        The pool is open today ({formatHourLabel(POOL_OPEN_HOUR)}–
        {formatHourLabel(POOL_CLOSE_HOUR)}), but live crowd levels aren&apos;t
        tracked today. Live tracking is back {nextDay}.
      </Subtitle>
      <div className="mt-8">
        <TrackingBadge />
        <p className="mt-4 max-w-md text-sm text-muted-foreground">
          Check <span className="font-medium text-foreground">Best Times to
          Visit</span> below for the pool&apos;s typical pattern.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Just-opened hero — a tracking day, pool just opened, no readings yet.
// Starts the day at empty, which is accurate before anyone arrives.
// ---------------------------------------------------------------------------

function JustOpenedHero() {
  return (
    <div className="flex flex-col">
      <Eyebrow icon={<LivePulse />}>Live · Pool Status</Eyebrow>
      <Headline>{crowdLabel("empty")}</Headline>
      <div className="mt-6 flex items-baseline gap-3">
        <span
          aria-label="0 percent full"
          className="font-display text-[clamp(3.5rem,9vw,6rem)] font-normal leading-none tracking-tight text-foreground"
        >
          0<span className="text-[0.55em] text-pond-600">%</span>
        </span>
        <span className="font-display text-2xl italic text-muted-foreground">
          full
        </span>
      </div>
      <Subtitle>
        No readings in yet today — the pool opens empty and fills as people
        arrive. Live crowd levels update through the day.
      </Subtitle>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paused hero — a tracking day that had readings, but the latest is stale.
// ---------------------------------------------------------------------------

function PausedHero() {
  return (
    <div className="flex flex-col">
      <Eyebrow
        icon={
          <WifiOff className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        }
      >
        Live · paused
      </Eyebrow>
      <Headline>Open</Headline>
      <Subtitle>
        The pool is open, but we&apos;re between readings right now — the live
        crowd level will update shortly. See{" "}
        <span className="font-medium text-foreground">Best Times to Visit</span>{" "}
        below in the meantime.
      </Subtitle>
      <div className="mt-8">
        <TrackingBadge />
      </div>
    </div>
  );
}

/** Small pill stating which days occupancy is tracked. */
function TrackingBadge() {
  return (
    <Badge
      variant="outline"
      className="gap-1.5 rounded-full bg-white/60 px-3 py-1 text-sm"
    >
      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
      Crowd levels tracked {formatTrackingDays()}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Small composable bits used by all three render paths
// ---------------------------------------------------------------------------

function Eyebrow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {icon}
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {children}
      </span>
    </div>
  );
}

function Headline({ children }: { children: React.ReactNode }) {
  return (
    <h1
      id="hero-status-heading"
      className="mt-7 font-display text-[clamp(2.75rem,7vw,5.25rem)] font-normal leading-[0.95] tracking-tight text-foreground text-balance"
    >
      {children}
      <span className="italic text-pond-600">.</span>
    </h1>
  );
}

function Subtitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 max-w-md text-lg leading-relaxed text-foreground/65 text-balance">
      {children}
    </p>
  );
}

function SmallLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

function CapacityBar({ occupancyPct }: { occupancyPct: number }) {
  return (
    <div className="mt-7">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium uppercase tracking-[0.15em]">Capacity</span>
        <span className="tabular-nums">{100 - occupancyPct}% available</span>
      </div>
      <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-pond-200/60 ring-1 ring-inset ring-pond-300/30">
        <div
          className="h-full rounded-full bg-gradient-to-r from-pond-400 to-pond-600 transition-[width] duration-1000 ease-out"
          style={{ width: `${occupancyPct}%` }}
        />
      </div>
    </div>
  );
}

function MetaRow({
  updatedValue,
  sourceLabel,
  sourceValue,
}: {
  updatedValue: string;
  sourceLabel?: string;
  sourceValue?: string;
}) {
  const hasSource = sourceLabel && sourceValue;
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-5 border-t border-border/50 pt-7",
        hasSource ? "grid-cols-2 sm:grid-cols-2" : "grid-cols-1",
      )}
    >
      <MetaItem
        icon={<Clock className="h-3.5 w-3.5" />}
        label="Last Updated"
        value={updatedValue}
      />
      {hasSource ? (
        <MetaItem
          icon={<ArrowUpRight className="h-3.5 w-3.5" />}
          label={sourceLabel}
          value={sourceValue}
        />
      ) : null}
    </dl>
  );
}

function MetaItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-1.5 text-base font-medium text-foreground tabular-nums">
        {value}
      </dd>
    </div>
  );
}

const ORDERED_LEVELS: CrowdLevel[] = [
  "empty",
  "plenty-of-space",
  "moderate",
  "busy",
  "very-busy",
];

function getQuieterHint(
  weeklyAverage: HourlyActivity[],
  currentLevel: CrowdLevel,
): string | null {
  const levelIdx = ORDERED_LEVELS.indexOf(currentLevel);
  // No hint needed when already calm
  if (levelIdx < 2) return null;

  const currentHour = Math.floor(currentLocalHour());

  // Future hours within pool operating window with weekly average data
  const futureHours = weeklyAverage
    .filter((d) => d.hour > currentHour && d.hour < POOL_CLOSE_HOUR)
    .sort((a, b) => a.hour - b.hour);

  // First upcoming hour where the average crowd level drops below current
  const quieterHour = futureHours.find(
    (d) => ORDERED_LEVELS.indexOf(activityToCrowdLevel(d.activity)) < levelIdx,
  );
  if (quieterHour) {
    return `Typically quieter after ${formatHourLabel(quieterHour.hour)}`;
  }

  // No quieter window today — check if opening hour is historically calmer
  const openingAvg = weeklyAverage.find((d) => d.hour === POOL_OPEN_HOUR);
  if (
    openingAvg &&
    ORDERED_LEVELS.indexOf(activityToCrowdLevel(openingAvg.activity)) < levelIdx
  ) {
    return `Stays busy through closing — typically quieter right at opening`;
  }

  return null;
}

function QuieterHint({
  weeklyAverage,
  currentLevel,
}: {
  weeklyAverage: HourlyActivity[] | null;
  currentLevel: CrowdLevel;
}) {
  const hint = weeklyAverage ? getQuieterHint(weeklyAverage, currentLevel) : null;
  if (!hint) return null;
  return (
    <div className="flex items-start gap-2.5">
      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pond-400" aria-hidden />
      <p className="text-sm leading-snug text-foreground/65">{hint}</p>
    </div>
  );
}

function HeroStatusSkeleton() {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-white/70 hero-gradient p-8 sm:p-12 lg:p-16">
      <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-3/4" />
          <Skeleton className="h-5 w-2/3" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-32 rounded-full" />
            <Skeleton className="h-7 w-32 rounded-full" />
          </div>
        </div>
        <div className="space-y-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-28 w-56" />
          <Skeleton className="h-2 w-full" />
          <div className="grid grid-cols-2 gap-4 pt-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        </div>
      </div>
    </section>
  );
}
