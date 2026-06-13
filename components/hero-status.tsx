"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Clock, Sparkles, TrendingUp } from "lucide-react";
import { LivePulse } from "./live-pulse";
import { AnimatedNumber } from "./animated-number";
import { Skeleton } from "./ui/skeleton";
import { Badge } from "./ui/badge";
import { cn, formatRelativeTime, pctFull } from "@/lib/utils";
import type { PoolStatus } from "@/lib/types";
import { crowdLabel } from "@/lib/mock-data";

interface HeroStatusProps {
  status: PoolStatus | null;
}

const CROWD_STYLES: Record<
  string,
  { dot: "emerald" | "amber" | "rose"; badge: "success" | "warning" | "danger"; emoji: string }
> = {
  empty: { dot: "emerald", badge: "success", emoji: "🟢" },
  "plenty-of-space": { dot: "emerald", badge: "success", emoji: "🟢" },
  moderate: { dot: "amber", badge: "warning", emoji: "🟡" },
  busy: { dot: "amber", badge: "warning", emoji: "🟠" },
  "very-busy": { dot: "rose", badge: "danger", emoji: "🔴" },
};

export function HeroStatus({ status }: HeroStatusProps) {
  // Keep relative time fresh on the client.
  const [, force] = useState(0);
  useEffect(() => {
    const i = setInterval(() => force((x) => x + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  if (!status) return <HeroStatusSkeleton />;

  const style = CROWD_STYLES[status.crowdLevel] ?? CROWD_STYLES.moderate;
  const occupancyPct = pctFull(status.occupancy, status.capacity);

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-white/70",
        "hero-gradient shadow-[0_2px_4px_rgba(20,37,49,0.04),0_24px_64px_-24px_rgba(20,37,49,0.18)]",
        "animate-scale-in",
      )}
      aria-labelledby="hero-status-heading"
    >
      {/* Decorative water-tile pattern overlay */}
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

      <div className="relative grid gap-12 p-8 sm:p-12 lg:grid-cols-[1.1fr_0.9fr] lg:p-16">
        {/* LEFT: Headline */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2.5">
            <LivePulse color={style.dot} />
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Live · Pool Status
            </span>
          </div>

          <h1
            id="hero-status-heading"
            className="mt-7 font-display text-[clamp(2.75rem,7vw,5.25rem)] font-normal leading-[0.95] tracking-tight text-foreground text-balance"
          >
            {crowdLabel(status.crowdLevel)}
            <span className="italic text-pond-600">.</span>
          </h1>

          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground text-balance">
            The pool is comfortably below capacity — a great time for a swim,
            with room to spread out on the deck.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Badge variant={style.badge} className="gap-1.5 rounded-full px-3 py-1 text-sm">
              <span aria-hidden>{style.emoji}</span>
              {crowdLabel(status.crowdLevel)}
            </Badge>
            <Badge variant="outline" className="gap-1.5 rounded-full bg-white/60 px-3 py-1 text-sm">
              <Sparkles className="h-3.5 w-3.5 text-pond-500" />
              {capConfidence(status.confidence)} confidence
            </Badge>
            <Badge variant="outline" className="gap-1.5 rounded-full bg-white/60 px-3 py-1 text-sm">
              <TrendingUp className="h-3.5 w-3.5 text-pond-500" />
              {trendLabel(status.trend)}
            </Badge>
          </div>
        </div>

        {/* RIGHT: Occupancy figure & meta */}
        <div className="flex flex-col justify-between gap-10">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Estimated Occupancy
            </p>
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

            {/* Capacity bar */}
            <div className="mt-7">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium uppercase tracking-[0.15em]">
                  Capacity
                </span>
                <span className="tabular-nums">{100 - occupancyPct}% available</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-pond-100/70">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-pond-400 to-pond-600 transition-[width] duration-1000 ease-out"
                  style={{ width: `${occupancyPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Meta row */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-border/50 pt-7 sm:grid-cols-2">
            <MetaItem
              icon={<Clock className="h-3.5 w-3.5" />}
              label="Last Updated"
              value={formatRelativeTime(status.lastUpdated)}
            />
            <MetaItem
              icon={<ArrowUpRight className="h-3.5 w-3.5" />}
              label="Reading from"
              value="Deck sensor · A2"
            />
          </dl>
        </div>
      </div>
    </section>
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

function capConfidence(c: PoolStatus["confidence"]) {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function trendLabel(t: PoolStatus["trend"]) {
  switch (t) {
    case "rising":
      return "Getting busier";
    case "falling":
      return "Getting quieter";
    default:
      return "Steady";
  }
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
