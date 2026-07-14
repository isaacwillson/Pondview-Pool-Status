"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Database,
  Plus,
  RotateCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { activityToCrowdLevel, crowdLabelShort } from "@/lib/mock-data";
import { pctFull } from "@/lib/utils";
import type { CrowdLevel } from "@/lib/types";

interface ApiRow {
  id: number;
  occupancy: number;
  capacity: number;
  recordedAt: string;
}

interface AdminDataTableProps {
  initialRows: ApiRow[];
  total: number;
  dbConnected: boolean;
  defaultCapacity: number;
  timezone: string;
}

interface RowState {
  key: string;
  id: number | null; // null = unsaved draft
  occupancy: string;
  capacity: string;
  when: string; // datetime-local value (browser local time)
  baseline: string | null; // signature of last-saved values; null for a draft
  saving: boolean;
  error: string | null;
}

const LEVEL_DOT: Record<CrowdLevel, string> = {
  empty: "bg-slate-300",
  "plenty-of-space": "bg-emerald-400",
  moderate: "bg-pond-400",
  busy: "bg-amber-400",
  "very-busy": "bg-rose-400",
};

let draftSeq = 0;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** UTC ISO → "YYYY-MM-DDTHH:mm" in the browser's local time. */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowLocalInput(): string {
  return isoToLocalInput(new Date().toISOString());
}

/** datetime-local (browser local) → UTC ISO, or null if unparseable. */
function localInputToIso(local: string): string | null {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function signature(occupancy: string, capacity: string, when: string): string {
  return `${occupancy.trim()}|${capacity.trim()}|${when}`;
}

function fromApiRow(r: ApiRow): RowState {
  const occupancy = String(r.occupancy);
  const capacity = String(r.capacity);
  const when = isoToLocalInput(r.recordedAt);
  return {
    key: `row-${r.id}`,
    id: r.id,
    occupancy,
    capacity,
    when,
    baseline: signature(occupancy, capacity, when),
    saving: false,
    error: null,
  };
}

export function AdminDataTable({
  initialRows,
  total,
  dbConnected,
  defaultCapacity,
  timezone,
}: AdminDataTableProps) {
  const [rows, setRows] = useState<RowState[]>(() =>
    initialRows.map(fromApiRow),
  );
  const [loadedTotal, setLoadedTotal] = useState(total);
  const [refreshing, setRefreshing] = useState(false);

  const patchRow = useCallback((key: string, patch: Partial<RowState>) => {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }, []);

  const addDraft = useCallback(() => {
    setRows((prev) => [
      {
        key: `draft-${draftSeq++}`,
        id: null,
        occupancy: "",
        capacity: String(defaultCapacity),
        when: nowLocalInput(),
        baseline: null,
        saving: false,
        error: null,
      },
      ...prev,
    ]);
  }, [defaultCapacity]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin-readings", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { rows: ApiRow[]; total: number } = await res.json();
      setRows((prev) => [
        // keep any unsaved drafts the user is mid-editing
        ...prev.filter((r) => r.id === null),
        ...data.rows.map(fromApiRow),
      ]);
      setLoadedTotal(data.total);
    } catch {
      /* leave current rows in place on a failed refresh */
    } finally {
      setRefreshing(false);
    }
  }, []);

  const saveRow = useCallback(
    async (row: RowState) => {
      const occupancy = Number(row.occupancy);
      const capacity = Number(row.capacity);
      const recordedAt = localInputToIso(row.when);

      if (!Number.isFinite(occupancy) || occupancy < 0) {
        patchRow(row.key, { error: "Occupancy must be 0 or more." });
        return;
      }
      if (!Number.isFinite(capacity) || capacity <= 0) {
        patchRow(row.key, { error: "Capacity must be greater than 0." });
        return;
      }
      if (!recordedAt) {
        patchRow(row.key, { error: "Enter a valid date & time." });
        return;
      }

      patchRow(row.key, { saving: true, error: null });
      const isNew = row.id === null;
      try {
        const res = await fetch("/api/admin-readings", {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: row.id ?? undefined,
            occupancy,
            capacity,
            recordedAt,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        const saved: ApiRow = body.row;
        setRows((prev) =>
          prev.map((r) => (r.key === row.key ? fromApiRow(saved) : r)),
        );
        if (isNew) setLoadedTotal((t) => t + 1);
      } catch (e) {
        patchRow(row.key, { saving: false, error: (e as Error).message });
      }
    },
    [patchRow],
  );

  const deleteRow = useCallback(
    async (row: RowState) => {
      if (row.id === null) {
        setRows((prev) => prev.filter((r) => r.key !== row.key));
        return;
      }
      patchRow(row.key, { saving: true, error: null });
      try {
        const res = await fetch("/api/admin-readings", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: row.id }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        setRows((prev) => prev.filter((r) => r.key !== row.key));
        setLoadedTotal((t) => Math.max(0, t - 1));
      } catch (e) {
        patchRow(row.key, { saving: false, error: (e as Error).message });
      }
    },
    [patchRow],
  );

  const savedCount = useMemo(
    () => rows.filter((r) => r.id !== null).length,
    [rows],
  );

  if (!dbConnected) {
    return (
      <Card className="flex flex-col items-center gap-3 border-dashed p-10 text-center">
        <Database className="h-6 w-6 text-muted-foreground" />
        <p className="font-display text-2xl text-foreground/80">
          No database connected
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          Readings are stored in Postgres. Set <code>DATABASE_URL</code> in your
          environment to view and edit data here. You can seed a week of demo
          readings with{" "}
          <code>node scripts/seed-readings.mjs</code>.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">
            {loadedTotal.toLocaleString()}
          </span>{" "}
          {loadedTotal === 1 ? "reading" : "readings"}
          {savedCount < loadedTotal ? (
            <span className="text-muted-foreground">
              {" "}
              · showing newest {savedCount.toLocaleString()}
            </span>
          ) : null}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={refresh} disabled={refreshing}>
            <RotateCw className={refreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            Refresh
          </Button>
          <Button size="sm" onClick={addDraft}>
            <Plus className="h-3.5 w-3.5" />
            Add reading
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-secondary/40 text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="px-4 py-3 font-medium">Recorded at</th>
                <th className="px-4 py-3 font-medium">Occupancy</th>
                <th className="px-4 py-3 font-medium">Capacity</th>
                <th className="px-4 py-3 font-medium">% Full</th>
                <th className="px-4 py-3 font-medium">Level</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    No readings yet. Click{" "}
                    <span className="font-medium text-foreground">Add reading</span>{" "}
                    to insert your first data point.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <DataRow
                    key={row.key}
                    row={row}
                    onChange={(patch) => patchRow(row.key, patch)}
                    onSave={() => saveRow(row)}
                    onDelete={() => deleteRow(row)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        Times are shown and entered in your browser&apos;s local timezone. The
        dashboard buckets readings by the pool&apos;s local time ({timezone}).
      </p>
    </div>
  );
}

function DataRow({
  row,
  onChange,
  onSave,
  onDelete,
}: {
  row: RowState;
  onChange: (patch: Partial<RowState>) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const occ = Number(row.occupancy);
  const cap = Number(row.capacity);
  const valid =
    Number.isFinite(occ) && occ >= 0 && Number.isFinite(cap) && cap > 0;
  const pct = valid ? pctFull(occ, cap) : null;
  const level = valid ? activityToCrowdLevel(occ / cap) : null;

  const dirty = row.baseline !== signature(row.occupancy, row.capacity, row.when);
  const isDraft = row.id === null;

  const inputClass =
    "rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm text-foreground focus:border-pond-500 focus:outline-none focus:ring-2 focus:ring-pond-500/20";

  return (
    <>
      <tr className={row.error ? "bg-rose-50/40" : "hover:bg-secondary/30"}>
        <td className="px-4 py-2.5 align-middle">
          <input
            type="datetime-local"
            value={row.when}
            onChange={(e) => onChange({ when: e.target.value })}
            className={inputClass}
          />
        </td>
        <td className="px-4 py-2.5 align-middle">
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={row.occupancy}
            onChange={(e) => onChange({ occupancy: e.target.value })}
            className={`w-20 ${inputClass}`}
          />
        </td>
        <td className="px-4 py-2.5 align-middle">
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={row.capacity}
            onChange={(e) => onChange({ capacity: e.target.value })}
            className={`w-20 ${inputClass}`}
          />
        </td>
        <td className="px-4 py-2.5 align-middle tabular-nums text-foreground">
          {pct === null ? "—" : `${pct}%`}
        </td>
        <td className="px-4 py-2.5 align-middle">
          {level ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={`h-2 w-2 rounded-full ${LEVEL_DOT[level]}`}
                aria-hidden
              />
              {crowdLabelShort(level)}
            </span>
          ) : (
            "—"
          )}
        </td>
        <td className="px-4 py-2.5 text-right align-middle">
          <div className="flex items-center justify-end gap-1.5">
            {isDraft || dirty ? (
              <Button
                size="sm"
                onClick={onSave}
                disabled={row.saving || !valid}
              >
                {row.saving ? (
                  "Saving…"
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    {isDraft ? "Add" : "Save"}
                  </>
                )}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={row.saving}
              aria-label="Delete reading"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
      </tr>
      {row.error ? (
        <tr>
          <td colSpan={6} className="px-4 pb-2.5">
            <p className="flex items-center gap-1.5 text-xs text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {row.error}
            </p>
          </td>
        </tr>
      ) : null}
    </>
  );
}
