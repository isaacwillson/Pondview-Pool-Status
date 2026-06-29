"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";
import { crowdLabelShort } from "@/lib/mock-data";
import { currentLocalHour, formatHourLabel } from "@/lib/time";
import type { CrowdLevel, HourlyActivity, HourlyActivitySet } from "@/lib/types";

interface BestTimesChartProps {
  data: HourlyActivitySet | null;
  isLoading: boolean;
}

type TabId = "today" | "yesterday" | "average";

const TABS: { id: TabId; label: string; quietestLabel: string }[] = [
  { id: "today", label: "Today", quietestLabel: "today" },
  { id: "yesterday", label: "Yesterday", quietestLabel: "yesterday" },
  { id: "average", label: "Weekly avg.", quietestLabel: "on average" },
];

const LEVEL_COLOR: Record<CrowdLevel, string> = {
  empty: "from-emerald-200 to-emerald-300",
  "plenty-of-space": "from-emerald-300 to-emerald-400",
  moderate: "from-pond-300 to-pond-400",
  busy: "from-amber-300 to-amber-400",
  "very-busy": "from-rose-300 to-rose-400",
};

const LEGEND: { level: CrowdLevel; swatch: string }[] = [
  { level: "plenty-of-space", swatch: "bg-emerald-400" },
  { level: "moderate", swatch: "bg-pond-400" },
  { level: "busy", swatch: "bg-amber-400" },
  { level: "very-busy", swatch: "bg-rose-400" },
];

export function BestTimesChart({ data, isLoading }: BestTimesChartProps) {
  const [tab, setTab] = useState<TabId>("today");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showRightFade, setShowRightFade] = useState(true);

  // Hoisted above early returns so all hooks are called unconditionally.
  const localHour = Math.floor(currentLocalHour());
  const tabData = data?.[tab] ?? null;
  const visible = tabData?.filter((d) => d.hour >= 10 && d.hour <= 20) ?? [];

  const updateFade = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowRightFade(scrollLeft < scrollWidth - clientWidth - 4);
  }, []);

  useEffect(() => {
    if (!scrollRef.current) return;
    // 26px min-width per bar + 6px gap-1.5 = 32px per slot
    const BAR_W = 32;
    if (tab === "today") {
      // Show current bar with ~3 bars of history to the left so ghost bars are visible on the right.
      scrollRef.current.scrollLeft = Math.max(0, (localHour - 10 - 3) * BAR_W);
    } else {
      scrollRef.current.scrollLeft = 0;
    }
    requestAnimationFrame(updateFade);
  }, [tab, localHour, updateFade]);

  if (!data) {
    if (isLoading) return <BestTimesSkeleton />;
    return <BestTimesEmpty />;
  }

  const activeTab = TABS.find((t) => t.id === tab)!;
  // Only hours that have already started are eligible for "quietest window"
  // on the Today tab — future hours have activity=0 and would always win.
  const eligibleForQuietest =
    tab === "today" ? visible.filter((d) => d.hour <= localHour) : visible;
  const quietest = eligibleForQuietest.length
    ? findQuietest(eligibleForQuietest)
    : null;

  return (
    <Card className="overflow-hidden bg-sand-50">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 p-7 sm:p-9">
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          </p>
          <CardTitle className="font-display text-3xl font-normal tracking-tight sm:text-4xl">
            Best Times to Visit
          </CardTitle>
        </div>

        <div
          role="tablist"
          aria-label="Time range"
          className="inline-flex rounded-full border border-border/70 bg-white/60 p-1 backdrop-blur"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition-all",
                tab === t.id
                  ? "bg-foreground text-background shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="px-7 pb-9 sm:px-9">
        {tabData === null ? (
          <div className="flex h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-secondary/40 text-center">
            <p className="font-display text-2xl text-foreground/80">
              {emptyTabTitle(tab)}
            </p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              {emptyTabBody(tab)}
            </p>
          </div>
        ) : (
          <div className="relative pl-9 sm:pl-10">
            {/* Y-axis scale labels — fixed, outside scroll container */}
            <div
              className="pointer-events-none absolute left-0 top-0 h-[260px] w-9 sm:w-10"
              aria-hidden
            >
              {[0.25, 0.5, 0.75, 1].map((y) => (
                <span
                  key={y}
                  className="absolute right-2 -translate-y-1/2 text-[10px] font-medium tabular-nums text-muted-foreground"
                  style={{ top: `${(1 - y) * 100}%` }}
                >
                  {Math.round(y * 100)}%
                </span>
              ))}
            </div>

            {/* Y-axis grid lines — fixed horizontal reference, no need to scroll */}
            <div className="pointer-events-none absolute inset-y-0 left-9 right-0 top-0 h-[260px] sm:left-10">
              {[0.25, 0.5, 0.75, 1].map((y) => (
                <div
                  key={y}
                  className="absolute inset-x-0 border-t border-dashed border-border/40"
                  style={{ top: `${(1 - y) * 100}%` }}
                />
              ))}
            </div>

            {/* Scrollable bars + x-axis */}
            <div className="relative">
              {/* Right-edge fade signals there's more content to scroll */}
              {showRightFade && (
                <div
                  className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-r from-transparent to-sand-50"
                  aria-hidden
                />
              )}
              <div
                ref={scrollRef}
                className="overflow-x-auto no-scrollbar"
                onScroll={updateFade}
              >
                <div className="relative flex h-[260px] items-end gap-1.5 sm:gap-2">
                  {visible.map((bar, i) => {
                    const isFuture = tab === "today" && bar.hour > localHour;
                    const heightPct = Math.max(4, bar.activity * 100);
                    const occupancyPct = Math.round(bar.activity * 100);
                    // For future bars, project height from the weekly average for that hour
                    const avgActivity =
                      data.average?.find((d) => d.hour === bar.hour)?.activity ?? 0;
                    const projectedHeight = Math.max(4, avgActivity * 100);
                    const hasProjection = isFuture && avgActivity > 0;
                    return (
                      <div
                        key={bar.hour}
                        className="group relative flex h-full min-w-[26px] flex-1 flex-col items-center justify-end"
                      >
                        {/* Tooltip on hover — hidden for future hours (no confirmed data) */}
                        {!isFuture && (
                          <div
                            className={cn(
                              "pointer-events-none absolute -top-2 z-10 -translate-y-full",
                              "rounded-lg border border-border/60 bg-white px-3 py-2 text-center shadow-lg",
                              "opacity-0 transition-opacity duration-150 group-hover:opacity-100",
                              "whitespace-nowrap",
                            )}
                          >
                            <div className="text-[11px] font-medium text-muted-foreground">
                              {formatHourLabel(bar.hour)}
                            </div>
                            <div className="text-sm font-semibold text-foreground tabular-nums">
                              {occupancyPct}% full
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {crowdLabelShort(bar.label)}
                            </div>
                          </div>
                        )}

                        {isFuture ? (
                          // Future hour: ghost bar at projected (weekly avg) height — no color meaning
                          hasProjection ? (
                            <div
                              className="w-full rounded-t-sm border-t-2 border-dashed border-foreground/30 bg-foreground/[0.07]"
                              style={{ height: `${projectedHeight}%`, opacity: 0.8 }}
                            />
                          ) : null
                        ) : (
                          <div
                            className={cn(
                              "w-full origin-bottom rounded-t-md bg-gradient-to-t transition-all duration-300",
                              LEVEL_COLOR[bar.label],
                              "group-hover:brightness-110",
                            )}
                            style={{
                              height: `${heightPct}%`,
                              animation: `bar-grow 0.9s cubic-bezier(0.16, 1, 0.3, 1) ${i * 35}ms both`,
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* X-axis labels — inside scroll container to stay aligned with bars */}
                <div className="mt-3 flex gap-1.5 text-[11px] text-muted-foreground sm:gap-2">
                  {visible.map((bar) => {
                    const showLabel = [10, 12, 14, 16, 18, 20].includes(bar.hour);
                    return (
                      <div
                        key={bar.hour}
                        className="flex min-w-[26px] flex-1 justify-center tabular-nums"
                      >
                        {showLabel ? formatHourLabel(bar.hour) : ""}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Legend + best-time suggestion */}
        <div className="mt-8 flex flex-col gap-5 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LEGEND.map((l) => (
              <div key={l.level} className="flex items-center gap-2">
                <span
                  className={cn("h-2.5 w-2.5 rounded-sm", l.swatch)}
                  aria-hidden
                />
                <span className="text-xs text-muted-foreground">
                  {crowdLabelShort(l.level)}
                </span>
              </div>
            ))}
            {tab === "today" && data.average && (
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-sm border border-dashed border-foreground/30 bg-foreground/[0.07]"
                  aria-hidden
                />
                <span className="text-xs text-muted-foreground">
                  Projected (weekly avg.)
                </span>
              </div>
            )}
          </div>

          {quietest ? (
            <Badge variant="info" className="gap-1.5 rounded-full px-3 py-1 text-xs">
              Quietest window {activeTab.quietestLabel} · {formatHourLabel(quietest.hour)}–
              {formatHourLabel(quietest.hour + 1)}
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** Find the visible hour with the lowest activity (ties → earliest hour). */
function findQuietest(visible: HourlyActivity[]): HourlyActivity {
  return visible.reduce((a, b) => (b.activity < a.activity ? b : a));
}

function emptyTabTitle(tab: TabId): string {
  switch (tab) {
    case "today":
      return "No readings yet today";
    case "yesterday":
      return "No data for yesterday";
    case "average":
      return "Not enough data for an average";
  }
}

function emptyTabBody(tab: TabId): string {
  switch (tab) {
    case "today":
      return "Today's activity curve will fill in here as the deck sensor reports occupancy throughout the day.";
    case "yesterday":
      return "Yesterday's curve will appear once a full day of readings has been recorded.";
    case "average":
      return "A 7-day rolling average will appear here after readings have come in for at least a few days.";
  }
}


function BestTimesEmpty() {
  return (
    <Card className="overflow-hidden bg-sand-50">
      <CardHeader className="p-7 sm:p-9">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Plan your swim
        </p>
        <CardTitle className="font-display text-3xl font-normal tracking-tight sm:text-4xl">
          Best Times to Visit
        </CardTitle>
      </CardHeader>
      <CardContent className="px-7 pb-9 sm:px-9">
        <div className="flex h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-secondary/40 text-center">
          <p className="font-display text-2xl text-foreground/80">
            Not enough data yet
          </p>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Today's activity curve will fill in here as the deck sensor reports
            occupancy throughout the day.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// Deterministic placeholder heights so SSR & client render identically.
const SKELETON_HEIGHTS = [
  32, 38, 46, 52, 58, 64, 68, 74, 78, 82, 86, 88, 84, 76, 64, 52, 42, 34,
];

function BestTimesSkeleton() {
  return (
    <Card className="bg-sand-50 p-7 sm:p-9">
      <div className="space-y-4">
        <div className="h-4 w-32 animate-pulse rounded bg-muted/70" />
        <div className="h-8 w-64 animate-pulse rounded bg-muted/70" />
        <div className="mt-6 flex h-[260px] items-end gap-2">
          {SKELETON_HEIGHTS.map((h, i) => (
            <div
              key={i}
              className="flex-1 animate-pulse rounded-t-md bg-muted/70"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
