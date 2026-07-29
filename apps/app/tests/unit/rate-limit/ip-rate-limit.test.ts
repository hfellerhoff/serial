import { describe, expect, it } from "vitest";
import type { KVStore } from "~/server/kv";
import { checkIpRateLimit, getRequestIp } from "~/server/rate-limit";

function request(headers: HeadersInit = {}) {
  return new Request("https://app.serial.tube/api/extension-auth/prepare", {
    headers,
  });
}

function counterStore() {
  const counts = new Map<string, number>();
  return {
    increment(key: string) {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return Promise.resolve(count);
    },
  } satisfies Pick<KVStore, "increment">;
}

describe("getRequestIp", () => {
  it("ignores forwarded addresses unless proxy trust is enabled", () => {
    expect(
      getRequestIp(request({ "x-forwarded-for": "203.0.113.4" }), 0),
    ).toBeNull();
  });

  it("selects the configured trusted hop from a valid chain", () => {
    const proxiedRequest = request({
      "x-forwarded-for": "198.51.100.2, 203.0.113.5",
    });
    expect(getRequestIp(proxiedRequest, 1)).toBe("203.0.113.5");
    expect(getRequestIp(proxiedRequest, 2)).toBe("198.51.100.2");
  });

  it("rejects incomplete or malformed forwarded chains", () => {
    expect(
      getRequestIp(request({ "x-forwarded-for": "invalid, 203.0.113.5" }), 1),
    ).toBeNull();
    expect(
      getRequestIp(request({ "x-forwarded-for": "203.0.113.5" }), 2),
    ).toBeNull();
  });
});

describe("checkIpRateLimit", () => {
  it("limits an IP within a fixed window", async () => {
    const store = counterStore();
    const options = {
      namespace: "test",
      limit: 2,
      windowSeconds: 60,
      now: 30_000,
      store,
      trustedProxyHops: 1,
    };
    const clientRequest = request({ "x-forwarded-for": "203.0.113.4" });

    await expect(
      checkIpRateLimit(clientRequest, options),
    ).resolves.toMatchObject({ allowed: true, remaining: 1 });
    await expect(
      checkIpRateLimit(clientRequest, options),
    ).resolves.toMatchObject({ allowed: true, remaining: 0 });
    await expect(
      checkIpRateLimit(clientRequest, options),
    ).resolves.toMatchObject({ allowed: false, remaining: 0 });
  });

  it("keeps different IPs in different buckets", async () => {
    const store = counterStore();
    const options = {
      namespace: "test",
      limit: 1,
      windowSeconds: 60,
      now: 30_000,
      store,
      trustedProxyHops: 1,
    };

    await expect(
      checkIpRateLimit(request({ "x-forwarded-for": "203.0.113.4" }), options),
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      checkIpRateLimit(request({ "x-forwarded-for": "203.0.113.5" }), options),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("fails open without a trustworthy client address", async () => {
    let incrementCalls = 0;
    const store = {
      increment() {
        incrementCalls += 1;
        return Promise.resolve(1);
      },
    } satisfies Pick<KVStore, "increment">;

    await expect(
      checkIpRateLimit(request({ "x-forwarded-for": "203.0.113.4" }), {
        namespace: "test",
        limit: 1,
        windowSeconds: 60,
        now: 30_000,
        store,
        trustedProxyHops: 0,
      }),
    ).resolves.toMatchObject({ allowed: true, remaining: 1 });
    expect(incrementCalls).toBe(0);
  });
});
