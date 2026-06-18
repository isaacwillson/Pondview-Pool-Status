/**
 * Server-side pool-status storage.
 *
 * Production: Upstash Redis (one key, one tiny JSON blob).
 * Local dev without Upstash env vars: module-level fallback so
 * the site runs while you set up credentials. The fallback warns
 * once at startup and is not used in production.
 */
import "server-only";
import { Redis } from "@upstash/redis";

export interface AdminPoolStatus {
  isOpen: boolean;
  reason: string | null;
  /** ISO timestamp of the last admin write. Null if never written. */
  lastChangedAt: string | null;
}

export const DEFAULT_STATUS: AdminPoolStatus = {
  isOpen: true,
  reason: null,
  lastChangedAt: null,
};

const KEY = "pondview:pool-status";

// ---------------------------------------------------------------------------
// Backend selection
// ---------------------------------------------------------------------------

interface Backend {
  get(): Promise<AdminPoolStatus | null>;
  set(value: AdminPoolStatus): Promise<void>;
}

let backend: Backend | null = null;
let warnedAboutFallback = false;

function getBackend(): Backend {
  if (backend) return backend;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    const redis = new Redis({ url, token });
    backend = {
      async get() {
        return (await redis.get<AdminPoolStatus>(KEY)) ?? null;
      },
      async set(value) {
        await redis.set(KEY, value);
      },
    };
    return backend;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN must be set in production.",
    );
  }

  if (!warnedAboutFallback) {
    console.warn(
      "[pool-status] Upstash env vars not set — using in-memory fallback. State will not persist across server restarts. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to use real storage.",
    );
    warnedAboutFallback = true;
  }

  let memory: AdminPoolStatus | null = null;
  backend = {
    async get() {
      return memory;
    },
    async set(value) {
      memory = value;
    },
  };
  return backend;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function readPoolStatus(): Promise<AdminPoolStatus> {
  const stored = await getBackend().get();
  return stored ?? DEFAULT_STATUS;
}

export async function writePoolStatus(
  next: Pick<AdminPoolStatus, "isOpen" | "reason">,
): Promise<AdminPoolStatus> {
  const value: AdminPoolStatus = {
    isOpen: next.isOpen,
    reason: next.reason?.trim() ? next.reason.trim() : null,
    lastChangedAt: new Date().toISOString(),
  };
  await getBackend().set(value);
  return value;
}
