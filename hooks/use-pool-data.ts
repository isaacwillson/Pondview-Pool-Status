"use client";

import { useEffect, useState } from "react";
import { buildSnapshot } from "@/lib/mock-data";
import type { PoolDataSnapshot } from "@/lib/types";

interface UsePoolDataResult {
  data: PoolDataSnapshot | null;
  isLoading: boolean;
}

/**
 * Returns a snapshot of pool data for the dashboard.
 *
 * Currently backed by `buildSnapshot()` mock data. To wire in a
 * real source, replace the contents of this hook with a fetch /
 * subscription call — the rest of the UI consumes `PoolDataSnapshot`
 * and doesn't care where it comes from.
 */
export function usePoolData(): UsePoolDataResult {
  const [data, setData] = useState<PoolDataSnapshot | null>(null);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    // Brief artificial latency so the loading skeleton is visible
    // on first mount — mimics a network request.
    const t = setTimeout(() => {
      setData(buildSnapshot());
      setLoading(false);
    }, 650);

    return () => clearTimeout(t);
  }, []);

  // Refresh "last updated" relative time on a slow cadence so the
  // hero card feels alive without rebuilding the whole snapshot.
  useEffect(() => {
    if (!data) return;
    const interval = setInterval(() => {
      setData((prev) => (prev ? { ...prev } : prev));
    }, 30_000);
    return () => clearInterval(interval);
  }, [data]);

  return { data, isLoading };
}
