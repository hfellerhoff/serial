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
  it("uses trusted proxy headers and validates their values", () => {
    expect(getRequestIp(request({ "cf-connecting-ip": "203.0.113.4" }))).toBe(
      "203.0.113.4",
    );
    expect(
      getRequestIp(
        request({
          "cf-connecting-ip": "invalid",
          "x-forwarded-for": "198.51.100.2, 203.0.113.5",
        }),
      ),
    ).toBe("203.0.113.5");
  });

  it("returns null without a valid address", () => {
    expect(getRequestIp(request({ "x-forwarded-for": "invalid" }))).toBeNull();
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
    };
    const clientRequest = request({ "x-real-ip": "203.0.113.4" });

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
    };

    await expect(
      checkIpRateLimit(request({ "x-real-ip": "203.0.113.4" }), options),
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      checkIpRateLimit(request({ "x-real-ip": "203.0.113.5" }), options),
    ).resolves.toMatchObject({ allowed: true });
  });
});
