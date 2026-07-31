import { afterEach, describe, expect, it } from "vitest";

import type {
  MixedContentCursor,
  MixedContentReference,
} from "~/server/mixed-content/projection";
import {
  clearRetainedEntityPins,
  setRetainedEntityPins,
} from "~/lib/data/page-retention";
import {
  getMixedScopeKey,
  mixedContentStore,
} from "~/lib/data/mixed-content/store";

const SCOPE = { type: "view" as const, viewId: 7 };

function cursor(index: number): Exclude<MixedContentCursor, null> {
  return {
    sectionPlacement: null,
    normalizedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
    entityKind: "feed-item",
    entityId: `feed-item-${index}`,
  };
}

function references(pageIndex: number): MixedContentReference[] {
  return Array.from({ length: 30 }, (_, itemIndex) => ({
    entityKind: "feed-item" as const,
    entityId: `page-${pageIndex}-item-${itemIndex}`,
    sectionPlacement: null,
    normalizedAt: new Date(Date.UTC(2026, 0, 1, 0, pageIndex, itemIndex)),
  }));
}

function applyPages(count: number) {
  for (let pageIndex = 0; pageIndex < count; pageIndex++) {
    mixedContentStore.getState().applyPage({
      scope: SCOPE,
      visibility: "unread",
      page: {
        references: references(pageIndex),
        bookmarks: [],
        feedItems: [],
        cursor: cursor(pageIndex),
        hasMore: true,
      },
      replacesScope: pageIndex === 0,
      feedItems: {},
    });
  }
}

afterEach(() => {
  mixedContentStore.getState().reset();
  clearRetainedEntityPins("reader:test");
});

describe("mixed-content page retention", () => {
  it("plateaus cursor pages and scope references during repeated pagination", () => {
    applyPages(12);

    const scope =
      mixedContentStore.getState().scopes[getMixedScopeKey(SCOPE, "unread")];

    expect(scope?.pages).toHaveLength(8);
    expect(scope?.references).toHaveLength(240);
    expect(
      scope?.references.some(({ entityId }) => entityId.startsWith("page-0-")),
    ).toBe(false);
    expect(
      scope?.references.some(({ entityId }) => entityId.startsWith("page-11-")),
    ).toBe(true);
  });

  it("keeps an open reader entity while evicting an otherwise distant page", () => {
    setRetainedEntityPins("reader:test", {
      feedItemIds: ["page-0-item-0"],
    });

    applyPages(12);

    const scope =
      mixedContentStore.getState().scopes[getMixedScopeKey(SCOPE, "unread")];
    expect(scope?.pages).toHaveLength(8);
    expect(
      scope?.references.some(({ entityId }) => entityId === "page-0-item-0"),
    ).toBe(true);
    expect(
      scope?.references.some(({ entityId }) => entityId.startsWith("page-1-")),
    ).toBe(false);
  });
});
