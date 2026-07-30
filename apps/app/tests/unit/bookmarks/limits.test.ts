import { describe, expect, it } from "vitest";
import { CaptureLimiter } from "~/server/bookmarks/limits";

describe("capture limits", () => {
  it("rejects concurrent app attempts per user and deployment", () => {
    const limiter = new CaptureLimiter(1);
    const first = limiter.acquire("one", "app");
    expect(first.ok).toBe(true);
    expect(limiter.acquire("one", "app")).toEqual({
      ok: false,
      reason: "capacity_limited",
    });
    expect(limiter.acquire("two", "app")).toEqual({
      ok: false,
      reason: "capacity_limited",
    });
    if (first.ok) first.release();
    expect(limiter.acquire("two", "app").ok).toBe(true);
  });

  it("counts rejected attempts toward the rolling rate window", () => {
    let now = 0;
    const limiter = new CaptureLimiter(1, () => now);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const lease = limiter.acquire("one", "app");
      expect(lease.ok).toBe(true);
      if (lease.ok) lease.release();
    }
    expect(limiter.acquire("one", "app")).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    now = 10 * 60 * 1_000 + 1;
    expect(limiter.acquire("one", "app").ok).toBe(true);
  });

  it("permits two extension ingestions per user", () => {
    const limiter = new CaptureLimiter(1);
    const first = limiter.acquire("one", "extension");
    const second = limiter.acquire("one", "extension");
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(limiter.acquire("one", "extension")).toEqual({
      ok: false,
      reason: "capacity_limited",
    });
  });
});
