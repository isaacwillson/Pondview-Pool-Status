/**
 * Resident-facing snapshot endpoint. Polled by the dashboard at 30s.
 *
 * Edge-cached for 30s so a busy site only hits Postgres a handful of
 * times per minute even with hundreds of residents on the page.
 */
import { NextResponse } from "next/server";
import { readDemoMode } from "@/lib/demo-mode";
import { buildSnapshot } from "@/lib/mock-data";
import { buildLiveSnapshot } from "@/lib/pool-data-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Demo mode (toggled from /admin/data) swaps in a generated snapshot —
  // the database is never touched, and flipping it back restores live data.
  const snapshot = (await readDemoMode())
    ? buildSnapshot()
    : await buildLiveSnapshot();
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
    },
  });
}
