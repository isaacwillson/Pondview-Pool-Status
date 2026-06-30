"use client";

import { useEffect, useRef } from "react";

const STORAGE_KEY = "pondview:scrollY";

/**
 * Restores the window scroll position across reloads.
 *
 * The browser's native restoration (`scrollRestoration: "auto"`) runs while the
 * loading skeletons are still showing, when the page is shorter than its final
 * height — so a reload from the bottom-most section gets clamped and, once the
 * real content expands the layout, lands on the wrong section.
 *
 * We take over, and the two important details are:
 *  - Capture the saved position *once on mount*, before our own scroll listener
 *    can overwrite it (e.g. a stray scroll event at the top during loading).
 *  - Re-apply it only once the page has actually grown tall enough to honor it,
 *    by polling the document height rather than trusting a "loaded" flag (which
 *    can fire while the layout is still short).
 */
export function useScrollRestoration() {
  const restored = useRef(false);

  // Take over from the browser's premature native restoration.
  useEffect(() => {
    if (!("scrollRestoration" in history)) return;
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => {
      history.scrollRestoration = previous;
    };
  }, []);

  // Capture the target on mount, then restore once the page is tall enough.
  useEffect(() => {
    if (restored.current) return;
    const saved = sessionStorage.getItem(STORAGE_KEY);
    const targetY = saved == null ? 0 : Number.parseInt(saved, 10);
    if (!targetY || Number.isNaN(targetY)) {
      restored.current = true;
      return;
    }

    let raf = 0;
    // Give up waiting for content after a few seconds (e.g. data never loads).
    const deadline = performance.now() + 3000;
    const attempt = () => {
      if (restored.current) return;
      const maxScroll =
        document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll >= targetY - 1 || performance.now() > deadline) {
        restored.current = true;
        window.scrollTo(0, Math.min(targetY, Math.max(0, maxScroll)));
        return;
      }
      raf = requestAnimationFrame(attempt);
    };
    raf = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Persist the latest scroll position (coalesced to one write per frame).
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        sessionStorage.setItem(STORAGE_KEY, String(Math.round(window.scrollY)));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
}
