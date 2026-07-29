import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { KVStore } from "~/server/kv";
import { env } from "~/env";
import { getKV } from "~/server/kv";
import { logError } from "~/server/logger";

type RateLimitOptions = {
  namespace: string;
  limit: number;
  windowSeconds: number;
  now?: number;
  store?: Pick<KVStore, "increment">;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter: number;
};

function validIp(value: string | null) {
  const candidate = value?.trim();
  return candidate && isIP(candidate) ? candidate : null;
}

/**
 * Proxy IP headers must be replaced by the deployment's trusted proxy. The
 * right-most forwarded address is preferred because append-only proxies make
 * it harder for a direct client to select an arbitrary identity.
 */
export function getRequestIp(request: Request): string | null {
  for (const header of ["cf-connecting-ip", "x-real-ip"]) {
    const candidate = validIp(request.headers.get(header));
    if (candidate) return candidate;
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",") ?? [];
  for (let index = forwarded.length - 1; index >= 0; index -= 1) {
    const candidate = validIp(forwarded[index] ?? null);
    if (candidate) return candidate;
  }

  return null;
}

function rateLimitIdentity(request: Request) {
  const ip = getRequestIp(request) ?? "unknown";
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(ip)
    .digest("hex")
    .slice(0, 32);
}

export async function checkIpRateLimit(
  request: Request,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const now = options.now ?? Date.now();
  const windowMilliseconds = options.windowSeconds * 1000;
  const window = Math.floor(now / windowMilliseconds);
  const retryAfter = Math.max(
    1,
    Math.ceil(((window + 1) * windowMilliseconds - now) / 1000),
  );
  const key = `${options.namespace}:${window}:${rateLimitIdentity(request)}`;

  try {
    const store = options.store ?? (await getKV());
    const count = await store.increment(key, options.windowSeconds + 1);
    return {
      allowed: count <= options.limit,
      limit: options.limit,
      remaining: Math.max(0, options.limit - count),
      retryAfter,
    };
  } catch (error) {
    // Authentication should remain available during a KV outage. The endpoint
    // is read-only, so failing open does not reintroduce database writes.
    logError("[rate-limit] Unable to check IP rate limit:", error);
    return {
      allowed: true,
      limit: options.limit,
      remaining: options.limit,
      retryAfter,
    };
  }
}
