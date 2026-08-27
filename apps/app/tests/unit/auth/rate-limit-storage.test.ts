import { describe, expect, it } from "vitest";
import { createKvRateLimitStorage } from "~/server/auth/rate-limit-storage";

/**
 * Backed by the in-memory KV (KV_STORE is unset in the unit env), which
 * shares the incr/expiry semantics of the Redis backends.
 */

describe("KV rate-limit storage", () => {
  it("allows up to max within a window, then blocks with retryAfter", async () => {
    const storage = createKvRateLimitStorage();
    const key = `consume-${Math.random()}`;
    const rule = { window: 60, max: 2 };

    expect(await storage.consume(key, rule)).toEqual({
      allowed: true,
      retryAfter: null,
    });
    expect(await storage.consume(key, rule)).toEqual({
      allowed: true,
      retryAfter: null,
    });
    expect(await storage.consume(key, rule)).toEqual({
      allowed: false,
      retryAfter: 60,
    });
  });

  it("keys are independent", async () => {
    const storage = createKvRateLimitStorage();
    const rule = { window: 60, max: 1 };
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;

    expect((await storage.consume(a, rule)).allowed).toBe(true);
    expect((await storage.consume(a, rule)).allowed).toBe(false);
    expect((await storage.consume(b, rule)).allowed).toBe(true);
  });

  it("legacy get reads the same counters consume writes", async () => {
    const storage = createKvRateLimitStorage();
    const key = `legacy-${Math.random()}`;
    await storage.consume(key, { window: 60, max: 10 });
    await storage.consume(key, { window: 60, max: 10 });

    const record = await storage.get(key);
    expect(record?.count).toBe(2);
  });
});
