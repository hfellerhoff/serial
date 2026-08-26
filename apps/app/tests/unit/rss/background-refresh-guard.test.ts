import { describe, expect, it } from "vitest";
import { createBackgroundRefreshRunGuard } from "~/server/rss/backgroundRefreshGuard";

describe("createBackgroundRefreshRunGuard", () => {
  it("rejects a second run while the first is still in progress", async () => {
    const guard = createBackgroundRefreshRunGuard();
    let resolveFirst: () => void = () => {};
    const firstRun = guard.run(
      () =>
        new Promise<string>(
          (resolve) => (resolveFirst = () => resolve("first")),
        ),
    );

    await expect(guard.run(() => Promise.resolve("second"))).resolves.toEqual({
      status: "skipped-overlap",
    });

    resolveFirst();
    await expect(firstRun).resolves.toEqual({
      status: "completed",
      result: "first",
    });
  });

  it("releases the guard after a failed run", async () => {
    const guard = createBackgroundRefreshRunGuard();
    await expect(
      guard.run(() => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    await expect(guard.run(() => Promise.resolve("again"))).resolves.toEqual({
      status: "completed",
      result: "again",
    });
  });
});
