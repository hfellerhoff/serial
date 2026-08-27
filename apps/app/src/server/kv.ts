import { env } from "~/env";
import { logError } from "~/server/logger";

/**
 * Minimal get/set/del KV interface that works with all three KV_STORE backends.
 * For "none" (no Redis), falls back to an in-memory Map with TTL.
 */

export interface KVStore {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ttlSeconds?: number) => Promise<void>;
  setNX: (key: string, value: string, ttlSeconds?: number) => Promise<boolean>;
  del: (key: string) => Promise<void>;
  /**
   * Atomically increment a counter, starting the TTL window when the key is
   * created. Returns the post-increment count. The TTL is established
   * before the increment so a failure between the two steps loses a count
   * instead of stranding an unexpiring key.
   */
  incr: (key: string, ttlSeconds: number) => Promise<number>;
  /**
   * Delete the key only if it still holds the expected value (atomic on
   * Redis backends). Returns whether a delete happened. Used for lock
   * release so an expired-and-reacquired lock is never freed by the
   * previous holder.
   */
  delIfEqual: (key: string, expected: string) => Promise<boolean>;
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

  async del(key: string) {
    this.store.delete(key);
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      await this.set(key, "1", ttlSeconds);
      return 1;
    }
    const next = (Number.parseInt(entry.value, 10) || 0) + 1;
    entry.value = String(next);
    return next;
  }

  async delIfEqual(key: string, expected: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiresAt || entry.value !== expected) {
      return false;
    }
    this.store.delete(key);
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

/** Compare-and-delete, atomic server-side on both Redis backends. */
const DEL_IF_EQUAL_LUA =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

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
      async del(key) {
        await redis.del(key);
      },
      async incr(key, ttlSeconds) {
        // TTL established before the increment (NX no-ops when the window
        // already exists), so a failure never strands an unexpiring key.
        await redis.set(key, "0", { nx: true, ex: ttlSeconds });
        return await redis.incr(key);
      },
      async delIfEqual(key, expected) {
        const result = await redis.eval(DEL_IF_EQUAL_LUA, [key], [expected]);
        return result === 1;
      },
    };
  }

  if (kvStore === "ioredis") {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(env.REDIS_URL!, {
      maxRetriesPerRequest: 3,
    });
    client.on("error", (err) => {
      logError("[kv] Redis error:", err.message);
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
      async del(key) {
        await client.del(key);
      },
      async incr(key, ttlSeconds) {
        // TTL established before the increment (NX no-ops when the window
        // already exists), so a failure never strands an unexpiring key.
        await client.set(key, "0", "EX", ttlSeconds, "NX");
        return await client.incr(key);
      },
      async delIfEqual(key, expected) {
        const result = await client.eval(DEL_IF_EQUAL_LUA, 1, key, expected);
        return result === 1;
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
