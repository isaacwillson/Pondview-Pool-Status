/**
 * Bearer-token check for the camera / CV process. Same constant-time
 * compare pattern as `admin-auth.ts`. One env var: `SENSOR_API_KEY`.
 */
import "server-only";
import { timingSafeEqual } from "node:crypto";

const BEARER_PREFIX = "Bearer ";

function getExpected(): string {
  const key = process.env.SENSOR_API_KEY;
  if (!key) throw new Error("SENSOR_API_KEY must be set.");
  return key;
}

export function authenticateSensorRequest(request: Request): boolean {
  const header = request.headers.get("authorization");
  if (!header || !header.startsWith(BEARER_PREFIX)) return false;
  const provided = header.slice(BEARER_PREFIX.length).trim();

  const expected = getExpected();
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
