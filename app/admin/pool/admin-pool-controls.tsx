"use client";

import { useEffect, useState } from "react";
import { Check, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { LivePulse } from "@/components/live-pulse";
import { formatRelativeTime } from "@/lib/utils";
import type { AdminPoolStatus } from "@/lib/pool-status";

interface AdminPoolControlsProps {
  initial: AdminPoolStatus;
}

export function AdminPoolControls({ initial }: AdminPoolControlsProps) {
  const [isOpen, setIsOpen] = useState(initial.isOpen);
  const [reason, setReason] = useState(initial.reason ?? "");
  const [saved, setSaved] = useState<AdminPoolStatus>(initial);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<number>(0);

  // Bump the relative-time stamp every 30s
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const dirty =
    isOpen !== saved.isOpen || (reason.trim() || null) !== saved.reason;

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/pool-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOpen, reason: reason.trim() || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const updated: AdminPoolStatus = await res.json();
      setSaved(updated);
      setReason(updated.reason ?? "");
      setSavedAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin-auth", { method: "DELETE" });
    window.location.href = "/admin/login";
  }

  const lastChanged = saved.lastChangedAt
    ? new Date(saved.lastChangedAt)
    : null;

  return (
    <div className="space-y-6">
      {/* Status pill */}
      <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-white/60 p-4">
        <div className="flex items-center gap-3">
          <LivePulse color={saved.isOpen ? "emerald" : "amber"} />
          <div>
            <p className="text-sm font-medium text-foreground">
              Currently {saved.isOpen ? "Open" : "Closed"}
            </p>
            <p className="text-xs text-muted-foreground">
              {lastChanged
                ? `Last changed ${formatRelativeTime(lastChanged)}`
                : "Initial default (never changed)"}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </Button>
      </div>

      {/* Main control card */}
      <Card className="p-7">
        <div className="flex items-center justify-between gap-6">
          <div>
            <label
              htmlFor="open-switch"
              className="font-display text-2xl tracking-tight text-foreground"
            >
              Pool is {isOpen ? "Open" : "Closed"}
            </label>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Residents see this change within a few seconds.
            </p>
          </div>
          <Switch
            id="open-switch"
            checked={isOpen}
            onCheckedChange={setIsOpen}
            aria-label="Toggle pool open / closed"
          />
        </div>

        <div className="mt-7 border-t border-border/50 pt-6">
          <label
            htmlFor="reason"
            className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground"
          >
            Reason {isOpen ? "(optional)" : ""}
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 240))}
            placeholder={
              isOpen
                ? "e.g. Heated through Sunday"
                : "e.g. Closed for maintenance until 5 PM"
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
