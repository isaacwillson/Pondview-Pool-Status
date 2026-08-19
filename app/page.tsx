"use client";

import { ExternalLink } from "lucide-react";
import { usePoolData } from "@/hooks/use-pool-data";
import { usePoolStatus } from "@/hooks/use-pool-status";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HeroStatus } from "@/components/hero-status";
import { BestTimesChart } from "@/components/best-times-chart";
import { LiveConditions } from "@/components/live-conditions";
import { WeeklyUsageSection } from "@/components/weekly-usage";

export default function HomePage() {
  const { data, isLoading } = usePoolData();
  const { status: adminStatus } = usePoolStatus();

  // Restore scroll position across reloads, waiting until the page has grown
  // to full height so a reload from the bottom section (Insights) isn't
  // clamped to the shorter skeleton layout.
  useScrollRestoration();

  return (
    <>
      <SiteHeader />

      <main className="container pb-12 pt-8 sm:pt-10">
        {/* Eyebrow + hero — tight pairing so the resident sees status above the fold */}
        <div className="space-y-4 sm:space-y-5">
          <div className="max-w-2xl animate-fade-in">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              For Pondview residents
            </p>
            <h2 className="mt-3 font-display text-2xl font-normal italic text-pond-700 sm:text-3xl">
              The Pondview Pool
            </h2>
          </div>

          {/* HERO STATUS */}
          <div id="status" className="scroll-mt-24">
            <HeroStatus
              status={data?.status ?? null}
              adminStatus={adminStatus}
              isLoading={isLoading}
              weeklyAverage={data?.hourlyActivity?.average ?? null}
              todayHasReadings={(data?.hourlyActivity?.today ?? null) !== null}
            />
          </div>
        </div>

        <div className="mt-14 space-y-16 lg:mt-16 lg:space-y-20">
          {/* BEST TIMES */}
          <div id="best-times" className="scroll-mt-24">
            <BestTimesChart
              data={data?.hourlyActivity ?? null}
              isLoading={isLoading}
            />
            {/* Contextual hand-off to the separate arrival-forecast site — the
                same "when to go" question, answered by prediction. Kept to one
                muted line so it reads as a helpful continuation, not clutter. */}
            <p className="mt-4 px-1 text-sm text-muted-foreground">
              Want to see how busy it&apos;ll get later?{" "}
              <a
                href="https://pondviewforecast.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-pond-700 underline-offset-2 hover:underline"
              >
                Check the hourly arrival forecast
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </p>
          </div>

          {/* LIVE CONDITIONS */}
          <div id="conditions" className="scroll-mt-24">
            <LiveConditions
              status={data?.status ?? null}
              conditions={data?.conditions ?? null}
              umbrellas={data?.umbrellas ?? null}
              adminStatus={adminStatus}
              isLoading={isLoading}
            />
          </div>

          {/* WEEKLY USAGE */}
          <div id="insights" className="scroll-mt-24">
            <WeeklyUsageSection
              data={data?.weeklyUsage ?? null}
              isLoading={isLoading}
            />
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
