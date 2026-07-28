import { describe, expect, it } from "vitest";
import type { ApplicationView } from "~/server/db/schema";
import { removeFeedReferencesFromViews } from "~/lib/data/views/store";

function makeView(): ApplicationView {
  const now = new Date("2026-07-25T00:00:00Z");

  return {
    id: 1,
    userId: "user-1",
    name: "My view",
    daysWindow: 0,
    readStatus: 0,
    orientation: "horizontal",
    contentType: "longform",
    layout: "large-list",
    placement: 0,
    createdAt: now,
    updatedAt: now,
    categoryIds: [7],
    feedIds: [10, 20],
    isDefault: false,
    viewSections: [
      {
        id: 1,
        viewId: 1,
        placement: 0,
        itemType: "feed",
        itemId: 10,
        layout: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 2,
        viewId: 1,
        placement: 1,
        itemType: "tag",
        itemId: 10,
        layout: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 3,
        viewId: 1,
        placement: 2,
        itemType: "feed",
        itemId: 20,
        layout: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

describe("removeFeedReferencesFromViews", () => {
  it("removes deleted feeds and only their feed-backed view sections", () => {
    const view = makeView();
    const result = removeFeedReferencesFromViews([view], new Set([10]));

    expect(result[0]?.feedIds).toEqual([20]);
    expect(result[0]?.viewSections.map((section) => section.id)).toEqual([
      2, 3,
    ]);
    expect(view.feedIds).toEqual([10, 20]);
    expect(view.viewSections).toHaveLength(3);
  });
});
