"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Database,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { activityToCrowdLevel, crowdLabelShort } from "@/lib/mock-data";
import { pctFull } from "@/lib/utils";
import type { CrowdLevel } from "@/lib/types";

interface ApiRow {
  id: number;
  occupancy: number;
  capacity: number;
  recordedAt: string;
  umbrellasMain: number | null;
  umbrellasKitty: number | null;
}

interface AdminDataTableProps {
  initialRows: ApiRow[];
  total: number;
  dbConnected: boolean;
  defaultCapacity: number;
  timezone: string;
  initialDemoMode: boolean;
}

interface RowState {
  key: string;
  id: number | null; // null = unsaved draft
  occupancy: string;
  capacity: string;
  umbMain: string; // umbrellas in use, main pool; "" = not counted
  umbKitty: string; // umbrellas in use, kitty pool; "" = not counted
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

/**
 * Sticky header cells for the scrolling window. The solid background matters:
 * sticky cells float over the rows, so a translucent one would show data
 * scrolling through the labels. The inset shadow stands in for a bottom
 * border, which wouldn't stick with the cell.
 */
const STICKY_TH =
  "sticky top-0 z-10 bg-secondary px-4 py-3 font-medium shadow-[inset_0_-1px_0_hsl(var(--border))]";

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

/**
 * An umbrella-count field: blank → null ("not counted"), a valid non-negative
 * number → that number, anything else → "invalid" so the caller can flag it.
 */
function parseUmbrellaInput(raw: string): number | null | "invalid" {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return Math.round(n);
}

function signature(row: {
  occupancy: string;
  capacity: string;
  umbMain: string;
  umbKitty: string;
  when: string;
}): string {
  return [
    row.occupancy.trim(),
    row.capacity.trim(),
    row.umbMain.trim(),
    row.umbKitty.trim(),
    row.when,
  ].join("|");
}

/**
 * Text a row can be found by in the search box: the raw input value
 * ("2026-06-28T15:05") plus human-readable renderings ("Sunday, June 28,
 * 2026, 3:05 PM" and "6/28/2026") so queries like "june 28", "3:05 PM",
 * "sunday", or "2026-06" all match.
 */
function rowHaystack(when: string): string {
  const d = new Date(when);
  if (Number.isNaN(d.getTime())) return when.toLowerCase();
  const long = d.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const short = d.toLocaleDateString("en-US");
  return `${when} ${long} ${short}`.toLowerCase();
}

function fromApiRow(r: ApiRow): RowState {
  const occupancy = String(r.occupancy);
  const capacity = String(r.capacity);
  const umbMain = r.umbrellasMain === null ? "" : String(r.umbrellasMain);
  const umbKitty = r.umbrellasKitty === null ? "" : String(r.umbrellasKitty);
  const when = isoToLocalInput(r.recordedAt);
  return {
    key: `row-${r.id}`,
    id: r.id,
    occupancy,
    capacity,
    umbMain,
    umbKitty,
    when,
    baseline: signature({ occupancy, capacity, umbMain, umbKitty, when }),
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
  initialDemoMode,
}: AdminDataTableProps) {
  const [rows, setRows] = useState<RowState[]>(() =>
    initialRows.map(fromApiRow),
  );
  const [loadedTotal, setLoadedTotal] = useState(total);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [demoMode, setDemoMode] = useState(initialDemoMode);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  // "Set capacity for all readings" — a bulk overwrite of every row's capacity.
  const [bulkCapacity, setBulkCapacity] = useState(String(defaultCapacity));
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkDone, setBulkDone] = useState<number | null>(null);

  const toggleDemo = useCallback(
    async (next: boolean) => {
      setDemoBusy(true);
      setDemoError(null);
      const previous = demoMode;
      // Optimistic flip — revert if the server rejects it.
      setDemoMode(next);
      try {
        const res = await fetch("/api/demo-mode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ demoMode: next }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        setDemoMode(Boolean(body.demoMode));
      } catch (e) {
        setDemoMode(previous);
        setDemoError((e as Error).message);
      } finally {
        setDemoBusy(false);
      }
    },
    [demoMode],
  );

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
        umbMain: "",
        umbKitty: "",
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
      const res = await fetch("/api/admin-readings?limit=500", {
        cache: "no-store",
      });
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

  const applyBulkCapacity = useCallback(async () => {
    const cap = Number(bulkCapacity);
    if (!Number.isFinite(cap) || cap <= 0) {
      setBulkError("Capacity must be greater than 0.");
      setBulkConfirm(false);
      return;
    }
    setBulkBusy(true);
    setBulkError(null);
    try {
      const res = await fetch("/api/admin-readings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capacity: cap }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setBulkDone(body.updated ?? 0);
      setBulkConfirm(false);
      // Pull the rewritten rows back in so the table reflects the new capacity.
      await refresh();
    } catch (e) {
      setBulkError((e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }, [bulkCapacity, refresh]);

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
      // Umbrellas are optional: blank → null ("not counted"). If filled, must
      // be a non-negative number.
      const umb = parseUmbrellaInput(row.umbMain);
      if (umb === "invalid") {
        patchRow(row.key, { error: "Main umbrellas must be 0 or more, or blank." });
        return;
      }
      const umbK = parseUmbrellaInput(row.umbKitty);
      if (umbK === "invalid") {
        patchRow(row.key, { error: "Kitty umbrellas must be 0 or more, or blank." });
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
            umbrellasMain: umb,
            umbrellasKitty: umbK,
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

  // Derived, not stored: recompute the visible subset whenever the rows or
  // the query change. Unsaved drafts always stay visible while being edited.
  const visibleRows = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return rows;
    return rows.filter((r) => {
      if (r.id === null) return true;
      const hay = rowHaystack(r.when);
      return tokens.every((t) => hay.includes(t));
    });
  }, [rows, query]);

  const isFiltering = query.trim().length > 0;
  const matchCount = isFiltering
    ? visibleRows.filter((r) => r.id !== null).length
    : savedCount;

  const demoCard = (
    <Card
      className={
        demoMode
          ? "border-amber-300/70 bg-amber-50/60 p-5"
          : "p-5"
      }
    >
      <div className="flex items-start justify-between gap-6">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              demoMode ? "bg-amber-100 text-amber-600" : "bg-pond-50 text-pond-600"
            }`}
            aria-hidden
          >
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <label
              htmlFor="demo-mode-switch"
              className="text-sm font-medium text-foreground"
            >
              Demo data on the resident view
            </label>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">
              Serve generated example data to the resident dashboard instead of
              database readings. Nothing is written to the database — switch it
              off to return to live data.
            </p>
            {demoMode ? (
              <p className="mt-2 text-xs font-medium text-amber-700">
                Residents are seeing demo data right now.
              </p>
            ) : null}
            {demoError ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                {demoError}
              </p>
            ) : null}
          </div>
        </div>
        <Switch
          id="demo-mode-switch"
          checked={demoMode}
          onCheckedChange={toggleDemo}
          disabled={demoBusy}
          aria-label="Serve demo data to the resident view"
        />
      </div>
    </Card>
  );

  if (!dbConnected) {
    return (
      <div className="space-y-4">
        {demoCard}
        <Card className="flex flex-col items-center gap-3 border-dashed p-10 text-center">
          <Database className="h-6 w-6 text-muted-foreground" />
          <p className="font-display text-2xl text-foreground/80">
            No database connected
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            Readings are stored in Postgres. Set <code>DATABASE_URL</code> in your
            environment to view and edit data here. You can seed a week of demo
            readings with{" "}
            <code>node scripts/seed-readings.mjs</code> — or flip on demo mode
            above to fill the resident view without a database.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {demoCard}

      {/* Bulk capacity — overwrite the capacity on every stored reading. */}
      <Card className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <label
              htmlFor="bulk-capacity"
              className="text-sm font-medium text-foreground"
            >
              Set capacity for all readings
            </label>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">
              Overwrite the capacity on every reading in the database. Past
              readings&apos; &ldquo;% full&rdquo; re-scale to this number.
            </p>
            {bulkError ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                {bulkError}
              </p>
            ) : bulkDone !== null ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <Check className="h-3.5 w-3.5" />
                Updated {bulkDone.toLocaleString()}{" "}
                {bulkDone === 1 ? "reading" : "readings"}.
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <input
              id="bulk-capacity"
              type="number"
              min={1}
              inputMode="numeric"
              value={bulkCapacity}
              onChange={(e) => {
                setBulkCapacity(e.target.value);
                setBulkConfirm(false);
                setBulkDone(null);
                setBulkError(null);
              }}
              className="w-24 rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm text-foreground focus:border-pond-500 focus:outline-none focus:ring-2 focus:ring-pond-500/20"
            />
            {bulkConfirm ? (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={applyBulkCapacity}
                  disabled={bulkBusy}
                >
                  {bulkBusy
                    ? "Applying…"
                    : `Overwrite all ${loadedTotal.toLocaleString()}`}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setBulkConfirm(false)}
                  disabled={bulkBusy}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBulkDone(null);
                  setBulkError(null);
                  setBulkConfirm(true);
                }}
                disabled={loadedTotal === 0}
              >
                Apply to all
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">
            {loadedTotal.toLocaleString()}
          </span>{" "}
          {loadedTotal === 1 ? "reading" : "readings"}
          {isFiltering ? (
            <span className="text-muted-foreground">
              {" "}
              · {matchCount.toLocaleString()}{" "}
              {matchCount === 1 ? "match" : "matches"}
            </span>
          ) : savedCount < loadedTotal ? (
            <span className="text-muted-foreground">
              {" "}
              · showing newest {savedCount.toLocaleString()}
            </span>
          ) : null}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search dates & times"
              aria-label="Search readings by date or time"
              className="w-56 rounded-lg border border-border bg-white py-1.5 pl-8 pr-7 text-sm text-foreground placeholder:text-muted-foreground focus:border-pond-500 focus:outline-none focus:ring-2 focus:ring-pond-500/20"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
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
        {/* Fixed-height window: the page stays put and the data scrolls.
            Header cells are sticky so column labels survive the scroll. */}
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                {[
                  "Recorded at",
                  "Occupancy",
                  "Capacity",
                  "% Full",
                  "Level",
                  "Umb. main",
                  "Umb. kitty",
                ].map((label) => (
                  <th key={label} className={STICKY_TH}>
                    {label}
                  </th>
                ))}
                <th className={`${STICKY_TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    No readings yet. Click{" "}
                    <span className="font-medium text-foreground">Add reading</span>{" "}
                    to insert your first data point.
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    No readings match{" "}
                    <span className="font-medium text-foreground">
                      &ldquo;{query.trim()}&rdquo;
                    </span>
                    . Try a date like &ldquo;June 28&rdquo; or a time like
                    &ldquo;3:05 PM&rdquo;.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
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

  const dirty = row.baseline !== signature(row);
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
        <td className="px-4 py-2.5 align-middle">
          <input
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="—"
            value={row.umbMain}
            onChange={(e) => onChange({ umbMain: e.target.value })}
            className={`w-20 ${inputClass}`}
            aria-label="Umbrellas in use, main pool"
          />
        </td>
        <td className="px-4 py-2.5 align-middle">
          <input
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="—"
            value={row.umbKitty}
            onChange={(e) => onChange({ umbKitty: e.target.value })}
            className={`w-20 ${inputClass}`}
            aria-label="Umbrellas in use, kitty pool"
          />
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
          <td colSpan={8} className="px-4 pb-2.5">
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
