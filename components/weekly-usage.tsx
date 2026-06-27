"use client";

import { Calendar, Crown, Moon, Users } from "lucide-react";
import { Card } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { cn, pctFull } from "@/lib/utils";
import type { WeeklyUsage } from "@/lib/types";

interface WeeklyUsageProps {
  data: WeeklyUsage | null;
  capacity: number | null;
  isLoading: boolean;
}

const WEEK_BARS = [
  { day: "Mon", value: 0.34 },
  { day: "Tue", value: 0.28 },
  { day: "Wed", value: 0.42 },
  { day: "Thu", value: 0.55 },
  { day: "Fri", value: 0.72 },
  { day: "Sat", value: 0.92 },
  { day: "Sun", value: 0.78 },
];

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
  const avgPct = pctFull(data.averageOccupancy, capacity);
  const quietPct = pctFull(data.quietestTime.averageOccupancy, capacity);
  const popularPct = pctFull(data.mostPopularTime.averageOccupancy, capacity);

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
        <p className="mt-3 max-w-xl text-base text-muted-foreground">
          Aggregated trends from the last seven days — helping residents find
          their preferred rhythm.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 stagger md:grid-cols-2 xl:grid-cols-4">
        <AnalyticCard
          icon={<Crown className="h-4 w-4" />}
          eyebrow="Peak Day"
          value={data.peakDay.day}
          delta={`avg ${peakPct}% full`}
          chip="Busier than usual"
          chipTone="warning"
        >
          {/* Weekly mini chart inside this card */}
          <div className="mt-4 flex items-end gap-1.5">
            {WEEK_BARS.map((b, i) => (
              <div key={b.day} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "w-full rounded-sm bg-gradient-to-t",
                    b.day === "Sat"
                      ? "from-amber-400 to-amber-300"
                      : "from-pond-200 to-pond-100",
                  )}
                  style={{
                    height: `${b.value * 56}px`,
                    animation: `bar-grow 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${
                      i * 50
                    }ms both`,
                    transformOrigin: "bottom",
                  }}
                />
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wider",
                    b.day === "Sat"
                      ? "font-semibold text-amber-700"
                      : "text-muted-foreground",
                  )}
                >
                  {b.day}
                </span>
              </div>
            ))}
          </div>
        </AnalyticCard>

        <AnalyticCard
          icon={<Users className="h-4 w-4" />}
          eyebrow="Average Occupancy"
          value={`${avgPct}%`}
          unit="full"
          delta="across all hours · 7-day mean"
          chip="Steady"
          chipTone="info"
        >
          <div className="mt-4">
            <Sparkline points={[18, 21, 19, 24, 22, 27, 25, 23, 26, 23]} />
          </div>
        </AnalyticCard>

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
              Tends to peak Friday–Sunday evenings.
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

function Sparkline({ points }: { points: number[] }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const w = 100;
  const h = 36;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = h - ((p - min) / range) * (h - 6) - 3;
    return [x, y] as const;
  });

  const path = coords
    .map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
    .join(" ");

  const fillPath = `${path} L ${w} ${h} L 0 ${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(53 118 150)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="rgb(53 118 150)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill="url(#sparkfill)" />
      <path
        d={path}
        fill="none"
        stroke="rgb(48 97 126)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={coords[coords.length - 1][0]}
        cy={coords[coords.length - 1][1]}
        r="2"
        fill="rgb(48 97 126)"
      />
    </svg>
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
        <p className="mt-3 max-w-xl text-base text-muted-foreground">
          Aggregated trends from the last seven days — helping residents find
          their preferred rhythm.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
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
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
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
