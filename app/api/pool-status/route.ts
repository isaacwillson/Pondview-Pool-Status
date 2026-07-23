import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { readPoolStatus, writePoolStatus } from "@/lib/pool-status";
import { getPostHogClient } from "@/lib/posthog-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await readPoolStatus();
  return NextResponse.json(status, {
    headers: {
      // Edge caches the response for 3 seconds, so a busy site only
      // hits Upstash ~once every 3s per Vercel region. Browsers always
      // revalidate (no max-age) so the polling cadence stays accurate.
      "Cache-Control": "public, s-maxage=3, stale-while-revalidate=10",
    },
  });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const { isOpen, reason } = body as Record<string, unknown>;
  if (typeof isOpen !== "boolean") {
    return NextResponse.json(
      { error: "`isOpen` must be a boolean." },
      { status: 400 },
    );
  }
  const reasonValue =
    typeof reason === "string" ? reason.slice(0, 240) : null;

  const next = await writePoolStatus({
    isOpen,
    reason: reasonValue,
  });

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: "admin",
    event: "pool_status_updated",
    properties: {
      is_open: isOpen,
      has_reason: Boolean(reasonValue),
    },
  });
  await posthog.flush();

  return NextResponse.json(next);
}
