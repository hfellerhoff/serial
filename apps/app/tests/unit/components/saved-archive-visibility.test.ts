import { describe, expect, it } from "vitest";

import {
  createSavedArchiveSnapshot,
  filterSavedSectionItems,
} from "~/components/feed/view-lists/savedArchiveVisibility";

describe("Saved archived visibility", () => {
  it("hides archived items until their section is revealed", () => {
    const archivedSnapshot = createSavedArchiveSnapshot(
      ["active", "archived"],
      (itemId) => itemId === "archived",
    );

    expect(
      filterSavedSectionItems({
        itemIds: ["active", "archived"],
        archivedSnapshot,
        showArchived: false,
      }),
    ).toEqual(["active"]);
    expect(
      filterSavedSectionItems({
        itemIds: ["active", "archived"],
        archivedSnapshot,
        showArchived: true,
      }),
    ).toEqual(["active", "archived"]);
  });

  it("hides an item as soon as its archived state changes", () => {
    expect(
      filterSavedSectionItems({
        itemIds: ["bookmark", "feed-item"],
        archivedSnapshot: new Map([
          ["bookmark", true],
          ["feed-item", true],
        ]),
        showArchived: false,
      }),
    ).toEqual([]);
  });
});
