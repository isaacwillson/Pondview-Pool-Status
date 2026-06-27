"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Clock, Lock, WifiOff } from "lucide-react";
import { LivePulse } from "./live-pulse";
import { AnimatedNumber } from "./animated-number";
import { Skeleton } from "./ui/skeleton";
import { Badge } from "./ui/badge";
import { cn, formatRelativeTime, pctFull } from "@/lib/utils";
import type { PoolStatus } from "@/lib/types";
import type { AdminPoolStatus } from "@/lib/pool-status";
import {
  deriveEffectivePoolStatus,
  type EffectivePoolStatus,
} from "@/lib/effective-status";
import { crowdLabel, crowdSubtitle } from "@/lib/mock-data";

interface HeroStatusProps {
  status: PoolStatus | null;
  adminStatus: AdminPoolStatus | null;
  isLoading: boolean;
}

export function HeroStatus({
  status,
  adminStatus,
  isLoading,
}: HeroStatusProps) {
  // Refresh relative-time strings and recompute the schedule branch.
  const [, force] = useState(0);
  useEffect(() => {
    const i = setInterval(() => force((x) => x + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  const effective = deriveEffectivePoolStatus(adminStatus);

  if (!effective.isOpen) {
    return (
      <HeroShell compact>
        <ClosedHero effective={effective} />
      </HeroShell>
    );
  }
  if (!status) {
    if (isLoading) return <HeroStatusSkeleton />;
    return (
      <HeroShell compact>
        <EmptyHero />
      </HeroShell>
    );
  }
  return (
    <HeroShell>
      <LiveHero status={status} />
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
          compact ? "lg:grid-cols-1" : "lg:grid-cols-[1.1fr_0.9fr]",
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

function LiveHero({ status }: { status: PoolStatus }) {
  const occupancyPct = pctFull(status.occupancy, status.capacity);

  return (
    <>
      <div className="flex flex-col">
        <Eyebrow icon={<LivePulse />}>Live · Pool Status</Eyebrow>
        <Headline>{crowdLabel(status.crowdLevel)}</Headline>
        <Subtitle>{crowdSubtitle(status.crowdLevel)}</Subtitle>
      </div>

      <div className="flex flex-col justify-between gap-10">
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
// Empty hero — sensor pipeline is wired up but no readings yet.
// ---------------------------------------------------------------------------

function EmptyHero() {
  return (
    <div className="flex flex-col">
      <Eyebrow
        icon={
          <span
            className="inline-flex h-2.5 w-2.5 rounded-full bg-muted-foreground/40"
            aria-hidden
          />
        }
      >
        Awaiting sensor data
      </Eyebrow>
      <Headline>Standing by</Headline>
      <Subtitle>
        Live occupancy will appear here as soon as it&apos;s available.
      </Subtitle>
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Badge variant="outline" className="gap-1.5 rounded-full bg-white/60 px-3 py-1 text-sm">
          <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
          No readings yet
        </Badge>
      </div>
    </div>
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
    <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground text-balance">
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
