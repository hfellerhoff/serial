import { describe, expect, it } from "vitest";

import {
  createSavedArchiveSnapshot,
  filterSavedSectionItems,
  mergeSavedSectionItems,
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

  it("merges a section's lazy archived page into Saved ordering", () => {
    const references = new Map([
      [
        "unread",
        {
          entityKind: "feed-item" as const,
          entityId: "unread",
          sectionPlacement: 1,
          normalizedAt: new Date("2026-08-08T10:00:00Z"),
        },
      ],
    ]);

    expect(
      mergeSavedSectionItems({
        itemIds: ["unread"],
        archivedReferences: [
          {
            entityKind: "bookmark",
            entityId: "archived-newer",
            sectionPlacement: 1,
            normalizedAt: new Date("2026-08-08T11:00:00Z"),
          },
          {
            entityKind: "bookmark",
            entityId: "removed",
            sectionPlacement: 1,
            normalizedAt: new Date("2026-08-08T12:00:00Z"),
          },
        ],
        getReference: (itemId) => references.get(itemId),
        isStillSaved: (itemId) => itemId !== "removed",
      }),
    ).toEqual(["archived-newer", "unread"]);
  });
});
