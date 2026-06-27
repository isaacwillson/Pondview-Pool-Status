"use client";

import { usePoolData } from "@/hooks/use-pool-data";
import { usePoolStatus } from "@/hooks/use-pool-status";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HeroStatus } from "@/components/hero-status";
import { BestTimesChart } from "@/components/best-times-chart";
import { LiveConditions } from "@/components/live-conditions";
import { WeeklyUsageSection } from "@/components/weekly-usage";

export default function HomePage() {
  const { data, isLoading } = usePoolData();
  const { status: adminStatus } = usePoolStatus();

  return (
    <>
      <SiteHeader />

      <main className="container pb-12 pt-8 sm:pt-10">
        {/* Eyebrow + hero — tight pairing so the resident sees status above the fold */}
        <div className="space-y-4 sm:space-y-5">
          <div className="max-w-2xl animate-fade-in">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Resident Amenities · Live
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
            />
          </div>
        </div>

        <div className="mt-20 space-y-20 lg:mt-28 lg:space-y-28">
          {/* BEST TIMES */}
          <div id="best-times" className="scroll-mt-24">
            <BestTimesChart
              data={data?.hourlyActivity ?? null}
              isLoading={isLoading}
            />
          </div>

          {/* LIVE CONDITIONS */}
          <div id="conditions" className="scroll-mt-24">
            <LiveConditions
              status={data?.status ?? null}
              conditions={data?.conditions ?? null}
              adminStatus={adminStatus}
              isLoading={isLoading}
            />
          </div>

          {/* WEEKLY USAGE */}
          <div id="insights" className="scroll-mt-24">
            <WeeklyUsageSection
              data={data?.weeklyUsage ?? null}
              capacity={data?.status?.capacity ?? null}
              isLoading={isLoading}
            />
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
