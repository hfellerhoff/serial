import { env } from "~/env";

/**
 * Minimal get/set/del KV interface that works with all three KV_STORE backends.
 * For "none" (no Redis), falls back to an in-memory Map with TTL.
 */

export interface KVStore {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ttlSeconds?: number) => Promise<void>;
  setNX: (key: string, value: string, ttlSeconds?: number) => Promise<boolean>;
}

// ── In-memory fallback ──────────────────────────────────────────────────────

/** How often to sweep expired entries, in milliseconds. */
const CLEANUP_INTERVAL_MS = 10_000;

class MemoryKV implements KVStore {
  private store = new Map<string, { value: string; expiresAt: number }>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private nextExpiry = Infinity;

  constructor() {
    this.scheduleCleanup();
  }

  async get(key: string) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity;
    this.store.set(key, { value, expiresAt });

    // Track the soonest expiry so we only run cleanup when needed
    if (expiresAt < this.nextExpiry) {
      this.nextExpiry = expiresAt;
    }
  }

  async setNX(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<boolean> {
    const entry = this.store.get(key);
    if (entry && Date.now() <= entry.expiresAt) {
      return false;
    }
    await this.set(key, value, ttlSeconds);
    return true;
  }

  /** Periodically sweep expired entries so they don't accumulate. */
  private scheduleCleanup() {
    this.cleanupTimer = setInterval(() => {
      if (this.store.size === 0 || Date.now() < this.nextExpiry) return;

      const now = Date.now();
      let earliest = Infinity;
      for (const [key, entry] of this.store) {
        if (now > entry.expiresAt) {
          this.store.delete(key);
        } else if (entry.expiresAt < earliest) {
          earliest = entry.expiresAt;
        }
      }
      this.nextExpiry = earliest;
    }, CLEANUP_INTERVAL_MS);

    // Allow the process to exit without waiting for the timer
    this.cleanupTimer.unref();
  }
}

// ── Create store based on KV_STORE env ──────────────────────────────────────

async function createKVStore(): Promise<KVStore> {
  const kvStore = env.KV_STORE;

  if (kvStore === "upstash") {
    const { Redis } = await import("@upstash/redis");
    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL!,
      token: env.UPSTASH_REDIS_REST_TOKEN!,
    });

    return {
      async get(key) {
        return (await redis.get<string>(key)) ?? null;
      },
      async set(key, value, ttlSeconds) {
        if (ttlSeconds && ttlSeconds > 0) {
          await redis.set(key, value, { ex: ttlSeconds });
        } else {
          await redis.set(key, value);
        }
      },
      async setNX(key, value, ttlSeconds) {
        const result =
          ttlSeconds && ttlSeconds > 0
            ? await redis.set(key, value, { nx: true, ex: ttlSeconds })
            : await redis.set(key, value, { nx: true });
        return result !== null;
      },
    };
  }

  if (kvStore === "ioredis") {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(env.REDIS_URL!, {
      maxRetriesPerRequest: 3,
    });
    client.on("error", (err) => {
      console.error("[kv] Redis error:", err.message);
    });

    return {
      async get(key) {
        return await client.get(key);
      },
      async set(key, value, ttlSeconds) {
        if (ttlSeconds && ttlSeconds > 0) {
          await client.set(key, value, "EX", ttlSeconds);
        } else {
          await client.set(key, value);
        }
      },
      async setNX(key, value, ttlSeconds) {
        if (ttlSeconds && ttlSeconds > 0) {
          const result = await client.set(key, value, "EX", ttlSeconds, "NX");
          return result === "OK";
        }
        const result = await client.set(key, value, "NX");
        return result === "OK";
      },
    };
  }

  // Fallback: in-memory
  return new MemoryKV();
}

let kvPromise: Promise<KVStore> | null = null;

export function getKV(): Promise<KVStore> {
  if (!kvPromise) {
    kvPromise = createKVStore();
  }
  return kvPromise;
}
