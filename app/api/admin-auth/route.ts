import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  checkPassword,
  isAdminAuthenticated,
  issueSessionCookie,
} from "@/lib/admin-auth";
import { getPostHogClient } from "@/lib/posthog-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const password =
    typeof body === "object" && body !== null && "password" in body
      ? (body as Record<string, unknown>).password
      : undefined;

  if (!checkPassword(password)) {
    const posthog = getPostHogClient();
    posthog.capture({ distinctId: "admin", event: "admin_login_failed" });
    await posthog.flush();
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const posthog = getPostHogClient();
  posthog.capture({ distinctId: "admin", event: "admin_login_succeeded" });
  await posthog.flush();

  const { value, expires } = issueSessionCookie();
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ADMIN_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ADMIN_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

export async function GET() {
  return NextResponse.json({ authenticated: await isAdminAuthenticated() });
}
