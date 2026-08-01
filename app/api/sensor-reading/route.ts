/**
 * Endpoint the camera / CV process POSTs occupancy readings to.
 *
 * Request:
 *   POST /api/sensor-reading
 *   Authorization: Bearer <SENSOR_API_KEY>
 *   { "occupancy": 17, "recordedAt"?: "2026-06-18T14:32:00Z" }
 *
 * `recordedAt` is optional; if omitted the server timestamps the
 * reading on arrival (so the camera doesn't need an accurate clock).
 * `capacity` is taken from server-side config — the camera shouldn't
 * need to know.
 */
import { NextResponse } from "next/server";
import { POOL_CAPACITY } from "@/lib/config";
import { insertReading } from "@/lib/occupancy-history";
import { authenticateSensorRequest } from "@/lib/sensor-auth";
import { getPostHogClient } from "@/lib/posthog-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sentinel for a present-but-invalid optional count. */
const INVALID = Symbol("invalid");

/**
 * An optional non-negative count: absent → null (not counted), a valid number
 * → that number, anything else → INVALID so the caller can 400.
 */
function parseOptionalCount(v: unknown): number | null | typeof INVALID {
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return INVALID;
  return Math.round(v);
}

export async function POST(request: Request) {
  if (!authenticateSensorRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const { occupancy, recordedAt, umbrellasMain, umbrellasKitty } =
    body as Record<string, unknown>;

  if (typeof occupancy !== "number" || !Number.isFinite(occupancy) || occupancy < 0) {
    return NextResponse.json(
      { error: "`occupancy` must be a non-negative number." },
      { status: 400 },
    );
  }

  // Optional umbrella counts — the camera may report them once it's set up.
  const mainUmb = parseOptionalCount(umbrellasMain);
  if (mainUmb === INVALID) {
    return NextResponse.json(
      { error: "`umbrellasMain` must be a non-negative number." },
      { status: 400 },
    );
  }
  const kittyUmb = parseOptionalCount(umbrellasKitty);
  if (kittyUmb === INVALID) {
    return NextResponse.json(
      { error: "`umbrellasKitty` must be a non-negative number." },
      { status: 400 },
    );
  }

  let recorded: Date | undefined;
  if (typeof recordedAt === "string") {
    const parsed = new Date(recordedAt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "`recordedAt` must be a valid ISO timestamp." },
        { status: 400 },
      );
    }
    recorded = parsed;
  }

  const roundedOccupancy = Math.round(occupancy);
  await insertReading({
    occupancy: roundedOccupancy,
    capacity: POOL_CAPACITY,
    recordedAt: recorded,
    umbrellasMain: mainUmb,
    umbrellasKitty: kittyUmb,
  });

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: "sensor",
    event: "sensor_reading_recorded",
    properties: {
      occupancy: roundedOccupancy,
      capacity: POOL_CAPACITY,
      occupancy_pct: Math.round((roundedOccupancy / POOL_CAPACITY) * 100),
    },
  });
  await posthog.flush();

  return NextResponse.json({ ok: true });
}
