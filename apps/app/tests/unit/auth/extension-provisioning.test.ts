import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const databaseMocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    query: {
      oauthClient: {
        findFirst: databaseMocks.findFirst,
      },
    },
    insert: databaseMocks.insert,
  },
}));

describe("extension OAuth client provisioning", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    databaseMocks.findFirst.mockReset();
    databaseMocks.insert.mockReset();
    databaseMocks.insert.mockReturnValue({
      values: () => ({
        onConflictDoNothing: () => Promise.resolve(),
      }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps timed-out database work shared until it settles", async () => {
    let finishLookup: ((value: undefined) => void) | undefined;
    const delayedLookup = new Promise<undefined>((resolve) => {
      finishLookup = resolve;
    });
    databaseMocks.findFirst.mockReturnValue(delayedLookup);

    const { ensureExtensionOAuthClient } =
      await import("~/server/auth/extension");
    const firstRequest = ensureExtensionOAuthClient();

    await vi.advanceTimersByTimeAsync(2_050);
    const secondRequest = ensureExtensionOAuthClient();

    expect(databaseMocks.findFirst).toHaveBeenCalledTimes(1);
    finishLookup?.(undefined);
    await vi.runAllTimersAsync();

    await expect(firstRequest).resolves.toBe("unchanged");
    await expect(secondRequest).resolves.toBe("created");
    expect(databaseMocks.findFirst).toHaveBeenCalledTimes(1);
    expect(databaseMocks.insert).toHaveBeenCalledTimes(1);
  });
});
