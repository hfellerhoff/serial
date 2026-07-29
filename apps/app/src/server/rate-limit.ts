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
  trustedProxyHops?: number;
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

/** Resolve the client at the configured hop in a fully valid proxy chain. */
export function getRequestIp(
  request: Request,
  trustedProxyHops = env.TRUSTED_PROXY_HOPS,
): string | null {
  if (trustedProxyHops < 1) return null;

  const forwarded = request.headers.get("x-forwarded-for")?.split(",") ?? [];
  const forwardedAddresses = forwarded.map((value) => validIp(value));
  const hasMalformedAddress = forwardedAddresses.some(
    (address) => address === null,
  );
  if (hasMalformedAddress || forwardedAddresses.length < trustedProxyHops) {
    return null;
  }

  return (
    forwardedAddresses[forwardedAddresses.length - trustedProxyHops] ?? null
  );
}

function rateLimitIdentity(ip: string) {
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
  const ip = getRequestIp(
    request,
    options.trustedProxyHops ?? env.TRUSTED_PROXY_HOPS,
  );
  if (!ip) {
    return {
      allowed: true,
      limit: options.limit,
      remaining: options.limit,
      retryAfter,
    };
  }
  const key = `${options.namespace}:${window}:${rateLimitIdentity(ip)}`;

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
    // Authentication should remain available during a KV outage. Preparation
    // can provision the OAuth client, but its writes are idempotent.
    logError("[rate-limit] Unable to check IP rate limit:", error);
    return {
      allowed: true,
      limit: options.limit,
      remaining: options.limit,
      retryAfter,
    };
  }
}
