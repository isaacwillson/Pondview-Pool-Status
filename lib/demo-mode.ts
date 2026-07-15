/**
 * Server-side "demo mode" flag.
 *
 * When enabled, /api/pool-data serves a generated demo snapshot instead of
 * real database readings — nothing is written to Postgres, and turning the
 * flag off instantly returns the resident view to live data.
 *
 * Storage mirrors lib/pool-status.ts: Upstash Redis in production, an
 * in-memory fallback for local dev without credentials. The flag must be
 * server-side (not a cookie or client state) because the resident view is
 * polled by every visitor's browser — the swap has to happen at the API.
 */
import "server-only";
import { Redis } from "@upstash/redis";

const KEY = "pondview:demo-mode";

interface Backend {
  get(): Promise<boolean | null>;
  set(value: boolean): Promise<void>;
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
        return (await redis.get<boolean>(KEY)) ?? null;
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
      "[demo-mode] Upstash env vars not set — using in-memory fallback. Demo mode will reset on server restart.",
    );
    warnedAboutFallback = true;
  }

  let memory: boolean | null = null;
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

/** Whether the resident view is currently serving demo data. */
export async function readDemoMode(): Promise<boolean> {
  return (await getBackend().get()) ?? false;
}

export async function writeDemoMode(on: boolean): Promise<boolean> {
  await getBackend().set(on);
  return on;
}
