"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { LivePulse } from "./live-pulse";
import { usePoolStatus } from "@/hooks/use-pool-status";
import { deriveEffectivePoolStatus } from "@/lib/effective-status";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { id: "status", label: "Pool", dimmable: false },
  { id: "best-times", label: "Best Times", dimmable: true },
  { id: "conditions", label: "Conditions", dimmable: true },
  { id: "insights", label: "Insights", dimmable: true },
];

// Stable reference so the scroll-spy effect doesn't re-run every render.
const SECTION_IDS = NAV_LINKS.map((l) => l.id);

/** Scroll-spy: returns the id of the section currently nearest the top. */
function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? "");
  useEffect(() => {
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          );
        if (visible[0]) setActive(visible[0].target.id);
      },
      // Activation band sits in the upper third of the viewport.
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

export function SiteHeader() {
  const { status } = usePoolStatus();
  // Re-render once a minute so schedule transitions take effect promptly
  // (admin status already re-renders this every 3 s via polling).
  const [, force] = useState(0);
  useEffect(() => {
    const i = setInterval(() => force((x) => x + 1), 60_000);
    return () => clearInterval(i);
  }, []);
  const active = useActiveSection(SECTION_IDS);
  const effective = deriveEffectivePoolStatus(status);
  const closed = !effective.isOpen;
  const closedByAdmin = effective.closedBy === "admin";
  const closedLabel = closedByAdmin ? "Closed by management" : "Outside pool hours";
  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/70 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo />
          <div className="hidden flex-col leading-tight sm:flex">
            <span className="font-display text-lg leading-none tracking-tight text-foreground">
              Pondview
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Residences
            </span>
          </div>
        </div>

        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {NAV_LINKS.map((link) => {
            const isActive = active === link.id;
            return (
              <a
                key={link.id}
                href={`#${link.id}`}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "relative transition-colors hover:text-foreground",
                  isActive
                    ? "font-medium text-foreground after:absolute after:-bottom-1.5 after:left-0 after:h-0.5 after:w-full after:rounded-full after:bg-pond-500"
                    : link.dimmable && closed
                      ? "text-muted-foreground/40"
                      : "text-muted-foreground",
                )}
              >
                {link.label}
              </a>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 rounded-full border border-border/70 bg-white/70 px-3 py-1.5 text-xs text-muted-foreground">
          {closed ? (
            <>
              <span
                className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-500"
                aria-hidden
              />
              <span className="hidden sm:inline">{closedLabel}</span>
              <Lock className="h-3 w-3 sm:hidden" />
            </>
          ) : (
            <>
              <LivePulse size="sm" />
              <span>Open</span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-pond-500 to-pond-700 shadow-sm">
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 text-white"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 14c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0" />
        <path d="M3 19c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0" />
        <path d="M8 10V5a2 2 0 0 1 4 0v9" />
        <path d="M16 14V5a2 2 0 0 0-4 0" />
      </svg>
    </span>
  );
}
