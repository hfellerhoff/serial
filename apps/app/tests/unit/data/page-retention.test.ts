import { describe, expect, it } from "vitest";

import type { RetainedCursorPage } from "~/lib/data/page-retention";
import {
  enforcePageRetention,
  getBoundedItemWindow,
  getRetainedPageMetrics,
  selectPersistedPages,
} from "~/lib/data/page-retention";

function makePage(index: number, byteSize = 100): RetainedCursorPage<string> {
  return {
    key: `cursor-${index}`,
    requestCursorKey: index === 0 ? "root" : `cursor-${index - 1}`,
    nextCursorKey: `cursor-${index}`,
    entityIds: [`item-${index}`],
    value: `page-${index}`,
    byteSize,
    sequence: index,
  };
}

describe("client page retention", () => {
  it("keeps the newest cursor-addressable navigation window within count and byte budgets", () => {
    const pages = Array.from({ length: 12 }, (_, index) => makePage(index));

    const retained = enforcePageRetention({
      pages,
      budget: {
        maxPages: 8,
        maxBytes: 1_000,
        navigationBufferPages: 2,
      },
      pinnedEntityIds: new Set(),
    });

    expect(retained.map((page) => page.key)).toEqual([
      "cursor-4",
      "cursor-5",
      "cursor-6",
      "cursor-7",
      "cursor-8",
      "cursor-9",
      "cursor-10",
      "cursor-11",
    ]);
    expect(getRetainedPageMetrics(retained)).toEqual({
      pages: 8,
      entities: 8,
      bytes: 800,
    });
  });

  it("retains pinned entities and the measured navigation buffer before the newest page", () => {
    const pages = Array.from({ length: 10 }, (_, index) => makePage(index));

    const retained = enforcePageRetention({
      pages,
      budget: {
        maxPages: 4,
        maxBytes: 10_000,
        navigationBufferPages: 2,
      },
      pinnedEntityIds: new Set(["item-1"]),
    });

    expect(retained.map((page) => page.key)).toEqual([
      "cursor-1",
      "cursor-7",
      "cursor-8",
      "cursor-9",
    ]);
  });

  it("lets pins exceed a hard budget instead of evicting an open or optimistic entity", () => {
    const pages = [makePage(0, 400), makePage(1, 400), makePage(2, 400)];

    const retained = enforcePageRetention({
      pages,
      budget: {
        maxPages: 1,
        maxBytes: 300,
        navigationBufferPages: 1,
      },
      pinnedEntityIds: new Set(["item-0"]),
    });

    expect(retained.map((page) => page.key)).toEqual([
      "cursor-0",
      "cursor-1",
      "cursor-2",
    ]);
  });

  it("persists only the newest complete pages that fit the IndexedDB budget", () => {
    const pages = Array.from({ length: 6 }, (_, index) => makePage(index, 100));

    const persisted = selectPersistedPages(pages, {
      maxPages: 3,
      maxBytes: 250,
      navigationBufferPages: 0,
    });

    expect(persisted.map((page) => page.key)).toEqual(["cursor-4", "cursor-5"]);
    expect(getRetainedPageMetrics(persisted).bytes).toBe(200);
  });

  it("keeps mounted list entities inside a fixed window and includes keyboard selection", () => {
    const itemIds = Array.from({ length: 300 }, (_, index) => `item-${index}`);

    expect(
      getBoundedItemWindow({
        itemIds,
        renderEnd: 240,
        selectedItemId: null,
        maxMountedItems: 180,
      }),
    ).toEqual({
      start: 60,
      end: 240,
      itemIds: itemIds.slice(60, 240),
    });
    expect(
      getBoundedItemWindow({
        itemIds,
        renderEnd: 240,
        selectedItemId: "item-20",
        maxMountedItems: 180,
      }),
    ).toEqual({
      start: 20,
      end: 200,
      itemIds: itemIds.slice(20, 200),
    });
  });
});
