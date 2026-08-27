import type { RateLimit } from "better-auth";
import { getKV } from "~/server/kv";

/**
 * Better Auth rate-limit storage over Serial's KV abstraction: shared
 * across app instances when Redis is configured, per-process (correct for
 * single-instance deploys) with KV_STORE=none. The atomic `consume` path is
 * a fixed window backed by KV `incr`; the `get`/`set` members exist only to
 * satisfy the storage interface's legacy non-atomic fallback.
 */

const PREFIX = "auth-rate-limit:";

interface KvRateLimitStorage {
  get: (key: string) => Promise<RateLimit | null>;
  set: (key: string, value: RateLimit) => Promise<void>;
  consume: (
    key: string,
    rule: { window: number; max: number },
  ) => Promise<{ allowed: boolean; retryAfter: number | null }>;
}

export function createKvRateLimitStorage(): KvRateLimitStorage {
  return {
    async get(key) {
      const kv = await getKV();
      const raw = await kv.get(`${PREFIX}${key}`);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as RateLimit;
      } catch {
        return null;
      }
    },
    async set(key, value) {
      const kv = await getKV();
      await kv.set(`${PREFIX}${key}`, JSON.stringify(value));
    },
    async consume(key, rule) {
      const kv = await getKV();
      const count = await kv.incr(`${PREFIX}count:${key}`, rule.window);
      if (count <= rule.max) return { allowed: true, retryAfter: null };
      // KV can't cheaply report remaining TTL; the full window is a safe
      // upper bound for the Retry-After header.
      return { allowed: false, retryAfter: rule.window };
    },
  };
}
