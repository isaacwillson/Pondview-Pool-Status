"use client";

import { useEffect, useRef } from "react";

const STORAGE_KEY = "pondview:scrollY";

/**
 * Restores the window scroll position across reloads — but only *after* the
 * page's async content has finished loading.
 *
 * The browser's native restoration (`scrollRestoration: "auto"`) runs while the
 * loading skeletons are still showing, when the page is shorter than its final
 * height. A reload from the bottom-most section then gets clamped to the short
 * page and, once the real content expands the layout, lands on the wrong
 * section. We take over: disable the native restore, remember the scroll
 * position as the user scrolls, and re-apply it once `ready` flips true and the
 * final layout height is in place.
 *
 * @param ready  becomes true once the page's data has loaded (final height).
 */
export function useScrollRestoration(ready: boolean) {
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

  // Persist the latest scroll position (coalesced to one write per frame).
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        sessionStorage.setItem(STORAGE_KEY, String(window.scrollY));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Once content is ready (final layout height), restore the saved position — once.
  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved == null) return;
    const y = Number.parseInt(saved, 10);
    if (Number.isNaN(y) || y === 0) return;
    // Wait a frame so the just-rendered content has its final height.
    requestAnimationFrame(() => window.scrollTo(0, y));
  }, [ready]);
}
