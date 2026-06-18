"use client";

import {
  Clock,
  Sun,
  Thermometer,
  TrendingDown,
  TrendingUp,
  Users,
  Waves,
} from "lucide-react";
import { Card } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { cn, pctFull } from "@/lib/utils";
import { crowdLabel } from "@/lib/mock-data";
import type { AdminPoolStatus } from "@/lib/pool-status";
import type { PoolConditions, PoolStatus } from "@/lib/types";

interface LiveConditionsProps {
  status: PoolStatus | null;
  conditions: PoolConditions | null;
  adminStatus: AdminPoolStatus | null;
  isLoading: boolean;
}

export function LiveConditions({
  status,
  conditions,
  adminStatus,
  isLoading,
}: LiveConditionsProps) {
  // Conditions (weather, pool hours) are always present once the snapshot
  // arrives. If we don't have them yet, we're either loading or the API
  // hard-failed — show the loading skeleton in either case.
  if (!conditions) return <LiveConditionsSkeleton />;

  const closed = adminStatus?.isOpen === false;
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
        : "Awaiting reading";
  const crowdSecondary = closed
    ? adminStatus?.reason ?? "Pool currently closed"
    : status
      ? `${occupancyPct}% full`
      : isLoading
        ? "Connecting…"
        : "No readings yet";
  const crowdAccent: "emerald" | "amber" | "pond" = closed
    ? "amber"
    : status
      ? "emerald"
      : "pond";
  const crowdMuted = !closed && !status;

  const trendPrimary = closed
    ? "—"
    : status
      ? trendDisplay(status.trend)
      : "—";
  const trendSecondary = closed
    ? "Unavailable while closed"
    : status
      ? trendSubtitle(status.trend)
      : isLoading
        ? "Connecting…"
        : "Available after a few readings";
  const trendMuted = closed || !status;

  return (
    <section aria-labelledby="conditions-heading">
      <SectionHeading
        eyebrow="At the pool right now"
        title="Live Pool Conditions"
        subtitle="Updated continuously from on-site sensors."
        id="conditions-heading"
      />

      <div className="mt-8 grid grid-cols-1 gap-4 stagger sm:grid-cols-2 lg:grid-cols-5">
        <ConditionCard
          icon={<Users className="h-4 w-4" />}
          label="Crowd Level"
          primary={crowdPrimary}
          secondary={crowdSecondary}
          accent={crowdAccent}
          muted={crowdMuted}
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
        />
        <ConditionCard
          icon={<Thermometer className="h-4 w-4" />}
          label="Air Temperature"
          primary={`${conditions.airTempF}°F`}
          secondary={`Water ${conditions.waterTempF}°F`}
          accent="rose"
        />
        <ConditionCard
          icon={<Sun className="h-4 w-4" />}
          label="UV Index"
          primary={`${conditions.uvIndex}`}
          secondary={uvLabel(conditions.uvIndex)}
          accent="amber"
        />
        <ConditionCard
          icon={<Clock className="h-4 w-4" />}
          label="Pool Hours"
          primary={`${formatHour(conditions.openFrom)} – ${formatHour(conditions.openUntil)}`}
          secondary={
            closed
              ? "Currently closed"
              : `${hoursLeft(conditions.openUntil)} hours left today`
          }
          accent="pond"
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
}: ConditionCardProps) {
  const s = ACCENT_STYLES[accent];
  return (
    <Card
      className={cn(
        "group relative overflow-hidden p-5 transition-all duration-300",
        "hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(20,37,49,0.04),0_18px_36px_-18px_rgba(20,37,49,0.18)]",
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
      <div className="relative">
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              s.iconBg,
            )}
            aria-hidden
          >
            {icon}
          </span>
          <Waves className="h-3.5 w-3.5 text-border" aria-hidden />
        </div>
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

function trendSubtitle(t: PoolStatus["trend"]) {
  switch (t) {
    case "rising":
      return "+8% in last 30 min";
    case "falling":
      return "−5% in last 30 min";
    default:
      return "No change in last 30 min";
  }
}

function uvLabel(uv: number) {
  if (uv <= 2) return "Low";
  if (uv <= 5) return "Moderate";
  if (uv <= 7) return "High";
  if (uv <= 10) return "Very High";
  return "Extreme";
}

function formatHour(d: Date) {
  // "8 AM" / "10 PM" — drop the minutes when they're :00 so the range stays compact.
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: d.getMinutes() === 0 ? undefined : "2-digit",
  });
}

function hoursLeft(end: Date) {
  const diff = (end.getTime() - Date.now()) / (1000 * 60 * 60);
  return Math.max(0, Math.round(diff * 10) / 10);
}

function LiveConditionsSkeleton() {
  return (
    <section>
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-72" />
      </div>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-5">
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
