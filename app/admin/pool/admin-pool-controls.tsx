"use client";

import { useEffect, useState } from "react";
import { Check, Clock, LogOut } from "lucide-react";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { LivePulse } from "@/components/live-pulse";
import { formatRelativeTime } from "@/lib/utils";
import {
  deriveEffectivePoolStatus,
  type EffectivePoolStatus,
} from "@/lib/effective-status";
import { POOL_CLOSE_HOUR, POOL_OPEN_HOUR } from "@/lib/config";
import { formatHourLabel } from "@/lib/time";
import type { AdminPoolStatus } from "@/lib/pool-status";

interface AdminPoolControlsProps {
  initial: AdminPoolStatus;
}

const SCHEDULE_LINE = `Normal hours: ${formatHourLabel(POOL_OPEN_HOUR)} – ${formatHourLabel(POOL_CLOSE_HOUR)} every day.`;

export function AdminPoolControls({ initial }: AdminPoolControlsProps) {
  // `forceClose` is the admin's only knob; default off. Internally still
  // serialises as `isOpen` for the existing /api/pool-status contract:
  //   forceClose = false  →  isOpen = true   (no override; schedule decides)
  //   forceClose = true   →  isOpen = false  (closed regardless of time)
  const [forceClose, setForceClose] = useState(!initial.isOpen);
  const [reason, setReason] = useState(initial.reason ?? "");
  const [saved, setSaved] = useState<AdminPoolStatus>(initial);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<number>(0);

  // Tick the schedule-driven derivation once a minute so the status pill
  // flips at the open/close boundaries without needing a manual refresh.
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const dirty =
    forceClose !== !saved.isOpen ||
    (reason.trim() || null) !== saved.reason;

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/pool-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isOpen: !forceClose,
          reason: reason.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const updated: AdminPoolStatus = await res.json();
      setSaved(updated);
      setForceClose(!updated.isOpen);
      setReason(updated.reason ?? "");
      setSavedAt(Date.now());
      posthog.capture("pool_override_saved", {
        force_close: !updated.isOpen,
        has_reason: Boolean(updated.reason),
      });
    } catch (e) {
      posthog.captureException(e);
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    posthog.capture("admin_logged_out");
    posthog.reset();
    await fetch("/api/admin-auth", { method: "DELETE" });
    window.location.href = "/admin/login";
  }

  const effective = deriveEffectivePoolStatus(saved);

  return (
    <div className="space-y-6">
      {/* Effective-state pill: what residents see right now */}
      <EffectiveStatePill
        effective={effective}
        onLogout={handleLogout}
      />

      {/* Main control card — force-close override */}
      <Card className="p-7">
        <div className="flex items-start justify-between gap-6">
          <div>
            <label
              htmlFor="force-close-switch"
              className="font-display text-2xl tracking-tight text-foreground"
            >
              Force the pool closed
            </label>
            <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
              Turn this on to override the schedule and close the pool for
              maintenance, weather, events, or any other reason. Residents see
              the change within a few seconds.
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {SCHEDULE_LINE}
            </p>
          </div>
          <Switch
            id="force-close-switch"
            checked={forceClose}
            onCheckedChange={setForceClose}
            aria-label="Force the pool closed"
          />
        </div>

        <div className="mt-7 border-t border-border/50 pt-6">
          <label
            htmlFor="reason"
            className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground"
          >
            Reason {forceClose ? "(shown to residents)" : "(optional)"}
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 240))}
            placeholder={
              forceClose
                ? "e.g. Closed for maintenance until 5 PM"
                : "Only shown when the override is on"
            }
            rows={3}
            className="mt-2 w-full resize-none rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-pond-500 focus:outline-none focus:ring-2 focus:ring-pond-500/20"
          />
          <p className="mt-1.5 text-right text-[11px] text-muted-foreground tabular-nums">
            {reason.length}/240
          </p>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-between">
          <SavedIndicator savedAt={savedAt} />
          <Button onClick={handleSave} disabled={!dirty || submitting}>
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function EffectiveStatePill({
  effective,
  onLogout,
}: {
  effective: EffectivePoolStatus;
  onLogout: () => void;
}) {
  const open = effective.isOpen;
  const byAdmin = effective.closedBy === "admin";

  const primary = open
    ? "Residents currently see: Open"
    : byAdmin
      ? "Residents currently see: Closed (by you)"
      : "Residents currently see: Closed (off-hours)";

  const secondary = open
    ? `Schedule closes the pool at ${formatHourLabel(POOL_CLOSE_HOUR)}.`
    : byAdmin && effective.adminStatus?.lastChangedAt
      ? `Override saved ${formatRelativeTime(new Date(effective.adminStatus.lastChangedAt))}` +
        (effective.closedReason ? ` · "${effective.closedReason}"` : "")
      : effective.closedReason ?? "Outside normal hours.";

  return (
    <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-white/60 p-4">
      <div className="flex items-center gap-3">
        <LivePulse color={open ? "emerald" : "amber"} />
        <div>
          <p className="text-sm font-medium text-foreground">{primary}</p>
          <p className="text-xs text-muted-foreground">{secondary}</p>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onLogout}>
        <LogOut className="h-3.5 w-3.5" />
        Sign out
      </Button>
    </div>
  );
}

function SavedIndicator({ savedAt }: { savedAt: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!savedAt) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2500);
    return () => clearTimeout(t);
  }, [savedAt]);

  return (
    <span
      className={`flex items-center gap-1.5 text-xs text-emerald-700 transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <Check className="h-3.5 w-3.5" />
      Saved
    </span>
  );
}
