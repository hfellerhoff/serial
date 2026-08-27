import { describe, expect, it } from "vitest";
import type { KVStore } from "~/server/kv";
import { createAtprotoRequestLock } from "~/server/auth/atproto/lock";

/** Deterministic in-memory KV with controllable expiry. */
function fakeKv(now: () => number = () => Date.now()): KVStore {
  const store = new Map<string, { value: string; expiresAt: number }>();
  const live = (key: string) => {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (now() > entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    async get(key) {
      return live(key)?.value ?? null;
    },
    async set(key, value, ttlSeconds) {
      store.set(key, {
        value,
        expiresAt: ttlSeconds ? now() + ttlSeconds * 1000 : Infinity,
      });
    },
    async setNX(key, value, ttlSeconds) {
      if (live(key)) return false;
      await this.set(key, value, ttlSeconds);
      return true;
    },
    async del(key) {
      store.delete(key);
    },
    async incr(key, ttlSeconds) {
      const entry = live(key);
      if (!entry) {
        await this.set(key, "1", ttlSeconds);
        return 1;
      }
      const next = (Number.parseInt(entry.value, 10) || 0) + 1;
      entry.value = String(next);
      return next;
    },
    async delIfEqual(key, expected) {
      const entry = live(key);
      if (!entry || entry.value !== expected) return false;
      store.delete(key);
      return true;
    },
  };
}

describe("atproto refresh lock", () => {
  it("serializes concurrent holders of the same name", async () => {
    const kv = fakeKv();
    const lock = createAtprotoRequestLock(async () => kv);
    const order: string[] = [];

    const first = lock("did:plc:x", async () => {
      order.push("first-start");
      await new Promise((r) => setTimeout(r, 100));
      order.push("first-end");
      return 1;
    });
    // Give the first call a head start on acquiring.
    await new Promise((r) => setTimeout(r, 10));
    const second = lock("did:plc:x", async () => {
      order.push("second-start");
      return 2;
    });

    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(order).toEqual(["first-start", "first-end", "second-start"]);
  });

  it("does not free a lock the holder no longer owns", async () => {
    let time = 0;
    const kv = fakeKv(() => time);
    const lock = createAtprotoRequestLock(async () => kv);

    await lock("did:plc:x", async () => {
      // Simulate the TTL elapsing mid-critical-section and another
      // instance acquiring the lock.
      time += 61_000;
      await kv.setNX("atproto-lock:did:plc:x", "other-holder", 60);
    });

    // The first holder's release must not have deleted the new owner.
    expect(await kv.get("atproto-lock:did:plc:x")).toBe("other-holder");
  });

  it("independent names do not contend", async () => {
    const kv = fakeKv();
    const lock = createAtprotoRequestLock(async () => kv);
    const results = await Promise.all([
      lock("did:plc:a", async () => "a"),
      lock("did:plc:b", async () => "b"),
    ]);
    expect(results).toEqual(["a", "b"]);
  });
});
