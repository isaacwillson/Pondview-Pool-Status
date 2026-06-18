"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminPoolStatus } from "@/lib/pool-status";

const POLL_INTERVAL_MS = 3_000;
const ENDPOINT = "/api/pool-status";

interface UsePoolStatusResult {
  status: AdminPoolStatus | null;
  isLoading: boolean;
  error: string | null;
  /** Admin-only. Posts a new status and updates local state optimistically. */
  mutate: (next: { isOpen: boolean; reason: string | null }) => Promise<void>;
}

export function usePoolStatus(): UsePoolStatusResult {
  const [status, setStatus] = useState<AdminPoolStatus | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const aborterRef = useRef<AbortController | null>(null);

  const fetchStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(ENDPOINT, { signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AdminPoolStatus = await res.json();
      setStatus(data);
      setError(null);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    aborterRef.current = ctrl;
    fetchStatus(ctrl.signal);
    const interval = setInterval(() => fetchStatus(), POLL_INTERVAL_MS);
    return () => {
      ctrl.abort();
      clearInterval(interval);
    };
  }, [fetchStatus]);

  const mutate = useCallback(
    async (next: { isOpen: boolean; reason: string | null }) => {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const updated: AdminPoolStatus = await res.json();
      setStatus(updated);
    },
    [],
  );

  return { status, isLoading, error, mutate };
}
