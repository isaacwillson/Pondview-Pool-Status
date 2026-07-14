/**
 * Admin CRUD over the raw `occupancy_readings` time-series — powers the
 * spreadsheet-style data editor at /admin/data. All methods require a valid
 * admin session (same cookie as the pool controls).
 *
 *   GET                      → { rows, total, dbConnected, defaultCapacity }
 *   POST   { occupancy, capacity?, recordedAt? }        → { row }
 *   PATCH  { id, occupancy, capacity, recordedAt }      → { row }
 *   DELETE { id }                                       → { ok }
 */
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isDbConfigured } from "@/lib/db";
import { POOL_CAPACITY } from "@/lib/config";
import {
  createReading,
  deleteReading,
  listReadings,
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
  };
}

/** Validate the editable fields shared by POST/PATCH. */
function parseFields(body: Record<string, unknown>, requireCapacity: boolean):
  | { occupancy: number; capacity: number; recordedAt?: Date }
  | { error: string } {
  const { occupancy, capacity, recordedAt } = body;

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

  return { occupancy: Math.round(occupancy), capacity: cap, recordedAt: recorded };
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
  return NextResponse.json({ row: serialize(row) });
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
  return NextResponse.json({ ok: true });
}
