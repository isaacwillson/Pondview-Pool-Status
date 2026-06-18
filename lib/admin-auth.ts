/**
 * Admin session auth using an HMAC-signed cookie.
 *
 * The cookie value is `<expiryMs>.<HMAC_SHA256(secret, expiryMs)>`.
 * The signing secret is derived from ADMIN_PASSWORD, so rotating
 * the password instantly invalidates every active session.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "pondview_admin";
export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function getPassword(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) {
    throw new Error("ADMIN_PASSWORD must be set.");
  }
  return pw;
}

function sign(payload: string): string {
  return createHmac("sha256", `pondview.admin.v1.${getPassword()}`)
    .update(payload)
    .digest("hex");
}

export function checkPassword(input: unknown): boolean {
  if (typeof input !== "string") return false;
  const expected = Buffer.from(getPassword());
  const provided = Buffer.from(input);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(expected, provided);
}

export function issueSessionCookie(): {
  value: string;
  expires: Date;
} {
  const expiresAt = Date.now() + SESSION_LIFETIME_MS;
  const value = `${expiresAt}.${sign(String(expiresAt))}`;
  return { value, expires: new Date(expiresAt) };
}

export function verifySessionCookie(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const [expiryStr, sig] = raw.split(".");
  if (!expiryStr || !sig) return false;
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;

  const expected = sign(expiryStr);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** True if the caller has a valid admin session. Reads the cookie store. */
export async function isAdminAuthenticated(): Promise<boolean> {
  const c = await cookies();
  return verifySessionCookie(c.get(ADMIN_COOKIE)?.value);
}
