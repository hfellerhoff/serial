import { describe, expect, it } from "vitest";

import {
  createSavedArchiveSnapshot,
  filterSavedSectionItems,
  getSoftArchivedSavedItemIds,
} from "~/components/feed/view-lists/savedArchiveVisibility";

describe("Saved archived visibility", () => {
  it("hides previously archived items until their section is revealed", () => {
    const archivedSnapshot = createSavedArchiveSnapshot(
      ["active", "archived"],
      (itemId) => ({
        archivedAt: itemId === "archived" ? new Date(100) : null,
        isArchived: itemId === "archived",
      }),
    );

    expect(
      filterSavedSectionItems({
        itemIds: ["active", "archived"],
        archivedSnapshot,
        showArchived: false,
        softArchivedItemIds: new Set(),
      }),
    ).toEqual(["active"]);
    expect(
      filterSavedSectionItems({
        itemIds: ["active", "archived"],
        archivedSnapshot,
        showArchived: true,
        softArchivedItemIds: new Set(),
      }),
    ).toEqual(["active", "archived"]);
  });

  it("keeps items archived during the active Saved context in place", () => {
    const current = new Map([
      ["bookmark", { archivedAt: new Date(1_001), isArchived: true }],
      ["feed-item", { archivedAt: new Date(1_002), isArchived: true }],
      ["already-archived", { archivedAt: new Date(999), isArchived: true }],
    ]);
    const softArchived = getSoftArchivedSavedItemIds(current, 1_000);

    expect([...softArchived]).toEqual(["bookmark", "feed-item"]);
    expect(
      filterSavedSectionItems({
        itemIds: ["bookmark", "feed-item", "already-archived"],
        archivedSnapshot: current,
        showArchived: false,
        softArchivedItemIds: softArchived,
      }),
    ).toEqual(["bookmark", "feed-item"]);
  });

  it("does not soft-retain content archived before Saved opened", () => {
    expect(
      getSoftArchivedSavedItemIds(
        new Map([
          ["active", { archivedAt: null, isArchived: false }],
          [
            "newly-loaded-archived",
            { archivedAt: new Date(999), isArchived: true },
          ],
        ]),
        1_000,
      ),
    ).toEqual(new Set());
  });
});
