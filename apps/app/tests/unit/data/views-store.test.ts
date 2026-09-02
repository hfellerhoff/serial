import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationView } from "~/server/db/schema";
import { viewsStoreApi } from "~/lib/data/views/store";

const mocks = vi.hoisted(() => ({ getAll: vi.fn() }));

vi.mock("~/lib/orpc", () => ({
  orpcRouterClient: { view: { getAll: mocks.getAll } },
}));

const FIXTURE_TIME = new Date("2026-08-18T12:00:00.000Z");

function makeView(
  id: number,
  overrides: Partial<ApplicationView> = {},
): ApplicationView {
  return {
    id,
    userId: "user-1",
    name: `View ${id}`,
    daysWindow: 0,
    readStatus: 0,
    contentFilter: 7,
    layout: "list",
    placement: id,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
    isDefault: false,
    categoryIds: [],
    feedIds: [],
    viewSections: [],
    ...overrides,
  };
}

describe("views store fetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewsStoreApi.getState().reset();
  });

  it("applies a fetched view list", async () => {
    const view = makeView(1);
    mocks.getAll.mockResolvedValue([view]);

    await viewsStoreApi.getState().fetch();

    expect(viewsStoreApi.getState().views).toEqual([view]);
    expect(viewsStoreApi.getState().fetchStatus).toBe("success");
  });

  it("refetches instead of applying a response made stale by a concurrent write", async () => {
    const staleView = makeView(1, { name: "Stale" });
    const importedView = makeView(2, { name: "Imported" });
    const freshView = makeView(3, { name: "Fresh" });

    let resolveFirst: ((views: ApplicationView[]) => void) | undefined;
    mocks.getAll
      .mockImplementationOnce(
        () =>
          new Promise<ApplicationView[]>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce([freshView]);

    const fetchPromise = viewsStoreApi.getState().fetch();

    // An import stream chunk lands while the request is in flight.
    viewsStoreApi.getState().set([importedView]);
    resolveFirst?.([staleView]);
    await fetchPromise;

    expect(mocks.getAll).toHaveBeenCalledTimes(2);
    expect(viewsStoreApi.getState().views).toEqual([freshView]);
    expect(viewsStoreApi.getState().fetchStatus).toBe("success");
  });

  it("resets the status when the request fails so later writes can render", async () => {
    mocks.getAll.mockRejectedValue(new Error("network down"));

    await expect(viewsStoreApi.getState().fetch()).rejects.toThrow(
      "network down",
    );

    expect(viewsStoreApi.getState().fetchStatus).toBe("idle");
  });
});
