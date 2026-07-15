/**
 * Admin toggle for demo mode (see lib/demo-mode.ts).
 *
 *   GET               → { demoMode }
 *   POST { demoMode } → { demoMode }
 *
 * Both require an admin session — demo mode changes what every resident
 * sees, so it's as sensitive as the open/closed override.
 */
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { readDemoMode, writeDemoMode } from "@/lib/demo-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

export async function GET() {
  if (!(await isAdminAuthenticated())) return unauthorized();
  return NextResponse.json({ demoMode: await readDemoMode() });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const demoMode =
    typeof body === "object" && body !== null && "demoMode" in body
      ? (body as Record<string, unknown>).demoMode
      : undefined;

  if (typeof demoMode !== "boolean") {
    return NextResponse.json(
      { error: "`demoMode` must be a boolean." },
      { status: 400 },
    );
  }

  return NextResponse.json({ demoMode: await writeDemoMode(demoMode) });
}
