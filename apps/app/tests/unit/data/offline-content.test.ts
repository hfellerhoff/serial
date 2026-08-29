import { describe, expect, it } from "vitest";
import type { ApplicationFeedItem } from "~/server/db/schema";
import {
  canOpenContent,
  canOpenOfflineContent,
  retainEligibleFeedBody,
  stripIneligibleFeedBodyForPersistence,
} from "~/lib/data/offline-content";
import { canMutate } from "~/lib/data/offline-mutations";

function archivedTextItem() {
  return {
    id: "item-1",
    contentType: "text",
    isWatched: true,
    content: "<p>Archived body</p>",
    contentSnippet: "Archived",
    contentHash: "hash-1",
  } as unknown as ApplicationFeedItem;
}

describe("archived body handling", () => {
  it("keeps an archived body in the live store for online reading", () => {
    const item = archivedTextItem();

    expect(retainEligibleFeedBody(undefined, item)).toBe(item);
  });

  it("strips an archived body from the persisted snapshot", () => {
    const item = archivedTextItem();

    const persisted = stripIneligibleFeedBodyForPersistence(item);

    expect(persisted.content).toBe("");
    expect(persisted.contentSnippet).toBe("Archived");
    expect(item.content).toBe("<p>Archived body</p>");
    // Stable identity across flushes so the normalized IDB diff sees no
    // change without a real update.
    expect(stripIneligibleFeedBodyForPersistence(item)).toBe(persisted);
  });

  it("passes through items whose body is already eligible or empty", () => {
    const eligible = { ...archivedTextItem(), isWatched: false };
    const empty = { ...archivedTextItem(), content: "" };

    expect(stripIneligibleFeedBodyForPersistence(eligible)).toBe(eligible);
    expect(stripIneligibleFeedBodyForPersistence(empty)).toBe(empty);
  });
});

describe("offline content capability", () => {
  it("opens normal destinations until disconnection is established", () => {
    expect(
      canOpenContent({
        connectionState: "unknown",
        contentType: "video",
        hasBody: false,
      }),
    ).toBe(true);
    expect(
      canOpenContent({
        connectionState: "connected",
        contentType: "text",
        hasBody: false,
      }),
    ).toBe(true);
  });

  it("opens only retained text while disconnected", () => {
    expect(canOpenOfflineContent({ contentType: "text", hasBody: true })).toBe(
      true,
    );
    expect(
      canOpenContent({
        connectionState: "disconnected",
        contentType: "text",
        hasBody: false,
      }),
    ).toBe(false);
    expect(
      canOpenContent({
        connectionState: "disconnected",
        contentType: "video",
        hasBody: true,
      }),
    ).toBe(false);
  });
});

describe("offline mutation gate", () => {
  it("blocks mutations only after disconnection is established", () => {
    expect(canMutate("unknown")).toBe(true);
    expect(canMutate("connected")).toBe(true);
    expect(canMutate("disconnected")).toBe(false);
  });
});
