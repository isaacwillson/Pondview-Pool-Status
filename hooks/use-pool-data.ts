"use client";

import { useEffect, useState } from "react";
import type { PoolDataSnapshot } from "@/lib/types";

const POLL_INTERVAL_MS = 30_000;

interface UsePoolDataResult {
  data: PoolDataSnapshot | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Resident dashboard snapshot.
 *
 * Fetches `/api/pool-data` (which composes the response from real
 * Postgres readings + mocked weather) and re-polls every 30 seconds.
 * Components consuming `data` decide their own empty-state behaviour
 * for sections that come back `null` (= "Not enough data yet").
 */
export function usePoolData(): UsePoolDataResult {
  const [data, setData] = useState<PoolDataSnapshot | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();

    async function fetchSnapshot() {
      try {
        const res = await fetch("/api/pool-data", {
          signal: ctrl.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: PoolDataSnapshot = await res.json();
        // Dates round-trip as ISO strings — restore them so components
        // can call .toLocaleTimeString() etc. without surprises.
        setData(reviveDates(json));
        setError(null);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }

    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, POLL_INTERVAL_MS);
    return () => {
      ctrl.abort();
      clearInterval(interval);
    };
  }, []);

  return { data, isLoading, error };
}

function reviveDates(snapshot: PoolDataSnapshot): PoolDataSnapshot {
  return {
    ...snapshot,
    status: snapshot.status
      ? {
          ...snapshot.status,
          lastUpdated: new Date(snapshot.status.lastUpdated),
        }
      : null,
    // `conditions` is already a plain JSON object — open/close are
    // hour integers and don't need revival.
  };
}
