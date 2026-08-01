/**
 * Admin CRUD over the raw `occupancy_readings` time-series — powers the
 * spreadsheet-style data editor at /admin/data. All methods require a valid
 * admin session (same cookie as the pool controls).
 *
 *   GET                      → { rows, total, dbConnected, defaultCapacity }
 *   POST   { occupancy, capacity?, recordedAt? }        → { row }
 *   PATCH  { id, occupancy, capacity, recordedAt }      → { row }
 *   PUT    { capacity }              → { updated, capacity }  (all readings)
 *   DELETE { id }                                       → { ok }
 */
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isDbConfigured } from "@/lib/db";
import { getPostHogClient } from "@/lib/posthog-server";
import { POOL_CAPACITY } from "@/lib/config";
import {
  createReading,
  deleteReading,
  listReadings,
  setAllReadingsCapacity,
  updateReading,
  type Reading,
} from "@/lib/occupancy-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

function noDatabase() {
  return NextResponse.json(
    { error: "No database configured. Set DATABASE_URL to record data." },
    { status: 503 },
  );
}

function serialize(r: Reading) {
  return {
    id: r.id,
    occupancy: r.occupancy,
    capacity: r.capacity,
    recordedAt: r.recordedAt.toISOString(),
    umbrellasMain: r.umbrellasMain,
    umbrellasKitty: r.umbrellasKitty,
  };
}

/**
 * Parse an optional umbrella count: blank/absent → null (not counted),
 * a valid non-negative number → that number, anything else → an error string.
 */
function parseUmbrella(
  v: unknown,
  field: string,
): { value: number | null } | { error: string } {
  if (v === undefined || v === null || v === "") return { value: null };
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
    return { error: `\`${field}\` must be a non-negative number.` };
  }
  return { value: Math.round(v) };
}

/** Validate the editable fields shared by POST/PATCH. */
function parseFields(body: Record<string, unknown>, requireCapacity: boolean):
  | {
      occupancy: number;
      capacity: number;
      recordedAt?: Date;
      umbrellasMain: number | null;
      umbrellasKitty: number | null;
    }
  | { error: string } {
  const { occupancy, capacity, recordedAt, umbrellasMain, umbrellasKitty } = body;

  if (
    typeof occupancy !== "number" ||
    !Number.isFinite(occupancy) ||
    occupancy < 0
  ) {
    return { error: "`occupancy` must be a non-negative number." };
  }

  let cap = POOL_CAPACITY;
  if (capacity !== undefined && capacity !== null) {
    if (typeof capacity !== "number" || !Number.isFinite(capacity) || capacity <= 0) {
      return { error: "`capacity` must be a positive number." };
    }
    cap = Math.round(capacity);
  } else if (requireCapacity) {
    return { error: "`capacity` is required." };
  }

  const mainUmb = parseUmbrella(umbrellasMain, "umbrellasMain");
  if ("error" in mainUmb) return { error: mainUmb.error };
  const kittyUmb = parseUmbrella(umbrellasKitty, "umbrellasKitty");
  if ("error" in kittyUmb) return { error: kittyUmb.error };

  let recorded: Date | undefined;
  if (recordedAt !== undefined && recordedAt !== null) {
    if (typeof recordedAt !== "string") {
      return { error: "`recordedAt` must be an ISO timestamp string." };
    }
    const parsed = new Date(recordedAt);
    if (Number.isNaN(parsed.getTime())) {
      return { error: "`recordedAt` is not a valid timestamp." };
    }
    recorded = parsed;
  }

  return {
    occupancy: Math.round(occupancy),
    capacity: cap,
    recordedAt: recorded,
    umbrellasMain: mainUmb.value,
    umbrellasKitty: kittyUmb.value,
  };
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    if (typeof body !== "object" || body === null) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return unauthorized();

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? 200);
  const offset = Number(searchParams.get("offset") ?? 0);

  const { rows, total } = await listReadings({
    limit: Number.isFinite(limit) ? limit : 200,
    offset: Number.isFinite(offset) ? offset : 0,
  });

  return NextResponse.json({
    rows: rows.map(serialize),
    total,
    dbConnected: isDbConfigured(),
    defaultCapacity: POOL_CAPACITY,
  });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return unauthorized();
  if (!isDbConfigured()) return noDatabase();

  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  const fields = parseFields(body, false);
  if ("error" in fields) {
    return NextResponse.json({ error: fields.error }, { status: 400 });
  }

  const row = await createReading(fields);
  if (!row) return noDatabase();

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: "admin",
    event: "admin_reading_created",
    properties: { occupancy: row.occupancy, capacity: row.capacity },
  });
  await posthog.flush();

  return NextResponse.json({ row: serialize(row) });
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) return unauthorized();
  if (!isDbConfigured()) return noDatabase();

  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "`id` is required." }, { status: 400 });
  }

  const fields = parseFields(body, true);
  if ("error" in fields) {
    return NextResponse.json({ error: fields.error }, { status: 400 });
  }

  const row = await updateReading(id, fields);
  if (!row) {
    return NextResponse.json({ error: "Reading not found." }, { status: 404 });
  }

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: "admin",
    event: "admin_reading_updated",
    properties: { reading_id: id, occupancy: row.occupancy, capacity: row.capacity },
  });
  await posthog.flush();

  return NextResponse.json({ row: serialize(row) });
}

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) return unauthorized();
  if (!isDbConfigured()) return noDatabase();

  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  const { capacity } = body;
  if (typeof capacity !== "number" || !Number.isFinite(capacity) || capacity <= 0) {
    return NextResponse.json(
      { error: "`capacity` must be a positive number." },
      { status: 400 },
    );
  }
  const cap = Math.round(capacity);

  const updated = await setAllReadingsCapacity(cap);

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: "admin",
    event: "admin_capacity_bulk_set",
    properties: { capacity: cap, updated },
  });
  await posthog.flush();

  return NextResponse.json({ updated, capacity: cap });
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) return unauthorized();
  if (!isDbConfigured()) return noDatabase();

  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "`id` is required." }, { status: 400 });
  }

  const ok = await deleteReading(id);
  if (!ok) {
    return NextResponse.json({ error: "Reading not found." }, { status: 404 });
  }

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: "admin",
    event: "admin_reading_deleted",
    properties: { reading_id: id },
  });
  await posthog.flush();

  return NextResponse.json({ ok: true });
}
