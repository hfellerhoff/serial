import { describe, expect, it } from "vitest";
import {
  compareSavedOrderCoordinates,
  sortFeedItemsOrderBySavedAt,
  sortFeedItemsOrderBySectionThenSavedAt,
} from "../../../src/lib/sortFeedItems";
import { createFeedItemFilterIndex } from "../../../src/lib/data/feed-items/listProjection";
import type {
  ApplicationFeedItem,
  ApplicationView,
} from "../../../src/server/db/schema";

const NOW = new Date("2026-08-08T12:00:00.000Z");

function item(
  id: string,
  input: Partial<ApplicationFeedItem> = {},
): ApplicationFeedItem {
  return {
    id,
    feedId: 1,
    contentId: id,
    title: id,
    author: "Serial",
    thumbnail: "",
    content: "",
    contentSnippet: "",
    url: `https://example.com/${id}`,
    postedAt: NOW,
    isWatched: false,
    isWatchLater: true,
    isWatchedUpdatedAt: null,
    isWatchLaterUpdatedAt: NOW,
    progress: 0,
    duration: 0,
    createdAt: NOW,
    updatedAt: NOW,
    platform: "website",
    contentType: "text",
    orientation: null,
    contentHash: null,
    ...input,
  };
}

describe("Saved client ordering", () => {
  it("uses Saved time before publication time and ignores read time", () => {
    const recentlySavedOldItem = item("recently-saved-old-item", {
      postedAt: new Date("2020-01-01T00:00:00.000Z"),
      isWatchLaterUpdatedAt: new Date("2026-08-08T11:00:00.000Z"),
    });
    const earlierSavedNewItem = item("earlier-saved-new-item", {
      postedAt: new Date("2026-08-08T11:59:00.000Z"),
      isWatchLaterUpdatedAt: new Date("2026-08-08T10:00:00.000Z"),
    });
    const items = {
      [recentlySavedOldItem.id]: recentlySavedOldItem,
      [earlierSavedNewItem.id]: earlierSavedNewItem,
    };

    const beforeRead = Object.keys(items).sort(
      sortFeedItemsOrderBySavedAt(items),
    );
    const readItems = {
      ...items,
      [earlierSavedNewItem.id]: {
        ...earlierSavedNewItem,
        isWatched: true,
        isWatchedUpdatedAt: new Date("2026-08-08T12:00:00.000Z"),
      },
    };

    expect(beforeRead).toEqual([
      recentlySavedOldItem.id,
      earlierSavedNewItem.id,
    ]);
    expect(
      Object.keys(readItems).sort(sortFeedItemsOrderBySavedAt(readItems)),
    ).toEqual(beforeRead);
  });

  it("matches server fallback and deterministic tie-break ordering", () => {
    const newestFallback = item("a", {
      postedAt: new Date("2026-08-08T11:00:00.000Z"),
      isWatchLaterUpdatedAt: null,
    });
    const olderFallback = item("z", {
      postedAt: new Date("2026-08-08T10:00:00.000Z"),
      isWatchLaterUpdatedAt: null,
    });
    const sameTimestampHigherId = item("z-saved");
    const sameTimestampLowerId = item("a-saved");
    const items = {
      [newestFallback.id]: newestFallback,
      [olderFallback.id]: olderFallback,
      [sameTimestampHigherId.id]: sameTimestampHigherId,
      [sameTimestampLowerId.id]: sameTimestampLowerId,
    };

    expect(Object.keys(items).sort(sortFeedItemsOrderBySavedAt(items))).toEqual(
      [
        sameTimestampHigherId.id,
        sameTimestampLowerId.id,
        newestFallback.id,
        olderFallback.id,
      ],
    );
    expect(
      compareSavedOrderCoordinates(olderFallback, newestFallback),
    ).toBeGreaterThan(0);
  });

  it("keeps section placement ahead of Saved time", () => {
    const firstSection = item("first-section", {
      feedId: 1,
      isWatchLaterUpdatedAt: new Date("2026-08-08T09:00:00.000Z"),
    });
    const secondSection = item("second-section", {
      feedId: 2,
      isWatchLaterUpdatedAt: new Date("2026-08-08T11:00:00.000Z"),
    });
    const view = {
      id: 10,
      userId: "user-one",
      name: "Saved",
      daysWindow: 0,
      readStatus: 0,
      contentFilter: 7,
      layout: "list",
      placement: 0,
      createdAt: NOW,
      updatedAt: NOW,
      isDefault: false,
      feedIds: [1, 2],
      categoryIds: [],
      viewSections: [
        {
          id: 1,
          viewId: 10,
          itemType: "feed",
          itemId: 1,
          placement: 0,
          layout: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
        {
          id: 2,
          viewId: 10,
          itemType: "feed",
          itemId: 2,
          placement: 1,
          layout: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    } satisfies ApplicationView;
    const filterIndex = createFeedItemFilterIndex([], [view]);
    const items = {
      [firstSection.id]: firstSection,
      [secondSection.id]: secondSection,
    };

    expect(
      Object.keys(items).sort(
        sortFeedItemsOrderBySectionThenSavedAt(
          items,
          view.viewSections,
          filterIndex,
        ),
      ),
    ).toEqual([firstSection.id, secondSection.id]);
  });
});
