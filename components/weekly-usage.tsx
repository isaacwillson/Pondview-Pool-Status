"use client";

import { Calendar, Crown, Moon } from "lucide-react";
import { Card } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { cn, pctFull } from "@/lib/utils";
import { formatTrackingDays, weekdayShortName } from "@/lib/time";
import { POOL_TRACKING_DAYS } from "@/lib/config";
import type { WeeklyUsage } from "@/lib/types";

interface WeeklyUsageProps {
  data: WeeklyUsage | null;
  capacity: number | null;
  isLoading: boolean;
}

export function WeeklyUsageSection({
  data,
  capacity,
  isLoading,
}: WeeklyUsageProps) {
  if (!data || !capacity) {
    if (isLoading) return <WeeklyUsageSkeleton />;
    return <WeeklyUsageEmpty />;
  }

  const peakPct = pctFull(data.peakDay.averageOccupancy, capacity);
  const quietPct = pctFull(data.quietestTime.averageOccupancy, capacity);
  const popularPct = pctFull(data.mostPopularTime.averageOccupancy, capacity);

  // Build the Peak Day sparkline from real per-weekday averages. Heights are
  // relative to the busiest day so the shape reads clearly; untracked days (or
  // any day with no readings) render as faint stubs.
  const maxDaily = Math.max(...data.dailyAverages, 1);
  const peakIndex = data.dailyAverages.indexOf(Math.max(...data.dailyAverages));
  const dayBars = data.dailyAverages.map((avg, day) => ({
    label: weekdayShortName(day),
    avg,
    tracked: POOL_TRACKING_DAYS.includes(day),
    isPeak: day === peakIndex && avg > 0,
    fraction: avg / maxDaily,
  }));

  return (
    <section aria-labelledby="weekly-heading">
      <div className="max-w-2xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Community insights
        </p>
        <h2
          id="weekly-heading"
          className="mt-3 font-display text-3xl font-normal leading-tight tracking-tight text-foreground sm:text-4xl"
        >
          This Week’s Usage
        </h2>
        <p className="mt-3 max-w-2xl text-balance text-base text-muted-foreground">
          Aggregated from the pool&apos;s tracked days ({formatTrackingDays()})
          over the past week, to help you find your preferred rhythm.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 stagger md:grid-cols-3">
        <AnalyticCard
          icon={<Moon className="h-4 w-4" />}
          eyebrow="Quietest Time"
          value={data.quietestTime.label}
          delta={`avg ${quietPct}% full`}
          chip="Best for laps"
          chipTone="success"
        >
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-border/60 bg-secondary/50 px-3.5 py-3">
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500"
              aria-hidden
            />
            <p className="text-sm leading-snug text-muted-foreground">
              Reliably calm weekday mornings.
            </p>
          </div>
        </AnalyticCard>

        <AnalyticCard
          icon={<Crown className="h-4 w-4" />}
          eyebrow="Peak Day"
          value={data.peakDay.day}
          delta={`avg ${peakPct}% full`}
          chip="Busier than usual"
          chipTone="warning"
        >
          <div className="mt-4 flex h-[68px] items-end gap-1.5">
            {dayBars.map((b, i) => (
              <div key={b.label} className="flex flex-1 flex-col items-center gap-1.5">
                {b.avg > 0 ? (
                  <div
                    className={cn(
                      "w-full rounded-sm bg-gradient-to-t",
                      b.isPeak
                        ? "from-amber-400 to-amber-300"
                        : "from-pond-200 to-pond-100",
                    )}
                    style={{
                      // Floor so a busy-but-not-peak day is still visible.
                      height: `${Math.max(4, b.fraction * 56)}px`,
                      animation: `bar-grow 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 50}ms both`,
                      transformOrigin: "bottom",
                    }}
                    title={`${b.label}: avg ${b.avg} people`}
                  />
                ) : (
                  // No readings this day (untracked, or simply none) → faint stub.
                  <div
                    className="w-full rounded-sm border border-dashed border-border/70"
                    style={{ height: "6px" }}
                    aria-hidden
                  />
                )}
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wider",
                    b.isPeak
                      ? "font-semibold text-amber-700"
                      : b.avg > 0
                        ? "text-muted-foreground"
                        : "text-muted-foreground/40",
                  )}
                >
                  {b.label}
                </span>
              </div>
            ))}
          </div>
        </AnalyticCard>

        <AnalyticCard
          icon={<Calendar className="h-4 w-4" />}
          eyebrow="Most Popular Time"
          value={data.mostPopularTime.label}
          delta={`avg ${popularPct}% full`}
          chip="Plan ahead"
          chipTone="warning"
        >
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-border/60 bg-secondary/50 px-3.5 py-3">
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500"
              aria-hidden
            />
            <p className="text-sm leading-snug text-muted-foreground">
              Tends to peak on Saturday evenings.
            </p>
          </div>
        </AnalyticCard>
      </div>
    </section>
  );
}

interface AnalyticCardProps {
  icon: React.ReactNode;
  eyebrow: string;
  value: string;
  unit?: string;
  delta: string;
  chip: string;
  chipTone: "success" | "warning" | "info";
  children?: React.ReactNode;
}

const CHIP_TONES = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
  warning: "bg-amber-50 text-amber-700 border-amber-200/60",
  info: "bg-pond-50 text-pond-700 border-pond-200/60",
};

function AnalyticCard({
  icon,
  eyebrow,
  value,
  unit,
  delta,
  chip,
  chipTone,
  children,
}: AnalyticCardProps) {
  return (
    <Card className="group flex flex-col p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(20,37,49,0.04),0_18px_36px_-18px_rgba(20,37,49,0.18)]">
      <div className="flex items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pond-50 text-pond-600">
          {icon}
        </span>
        <span
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
            CHIP_TONES[chipTone],
          )}
        >
          {chip}
        </span>
      </div>

      <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
        {eyebrow}
      </p>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-display text-4xl font-normal leading-none tracking-tight text-foreground">
          {value}
        </span>
        {unit ? (
          <span className="text-sm font-medium text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">{delta}</p>

      {children ? <div>{children}</div> : null}
    </Card>
  );
}


function WeeklyUsageEmpty() {
  return (
    <section aria-labelledby="weekly-heading">
      <div className="max-w-2xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Community insights
        </p>
        <h2
          id="weekly-heading"
          className="mt-3 font-display text-3xl font-normal leading-tight tracking-tight text-foreground sm:text-4xl"
        >
          This Week’s Usage
        </h2>
        <p className="mt-3 max-w-2xl text-balance text-base text-muted-foreground">
          Aggregated from the pool&apos;s tracked days ({formatTrackingDays()})
          over the past week, to help you find your preferred rhythm.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card
            key={i}
            className="flex flex-col items-center justify-center border-dashed bg-secondary/30 p-8 text-center"
          >
            <p className="font-display text-xl text-foreground/80">
              Not enough data yet
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Available after ~7 days of readings.
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function WeeklyUsageSkeleton() {
  return (
    <section>
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-72" />
      </div>
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-6">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="mt-5 h-3 w-24" />
            <Skeleton className="mt-2 h-9 w-32" />
            <Skeleton className="mt-2 h-4 w-32" />
            <Skeleton className="mt-4 h-14 w-full" />
          </Card>
        ))}
      </div>
    </section>
  );
}
