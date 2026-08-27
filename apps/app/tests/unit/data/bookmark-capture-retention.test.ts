import { afterEach, describe, expect, it } from "vitest";
import type { DatabasePageCapture } from "~/server/db/schema";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import { bookmarkCapturesStore } from "~/lib/data/bookmarks/capture-store";
import { bookmarksStore } from "~/lib/data/bookmarks/store";

const capture: DatabasePageCapture = {
  bookmarkId: "bookmark-1",
  contentHtml: "<p>Retained Page capture</p>",
  contentHash: "capture-hash",
  captureSource: "server-static-fetch",
  extractorVersion: "test",
  sanitizerPolicyVersion: 1,
  capturedAt: new Date("2026-08-27T12:00:00Z"),
};

const bookmark = {
  id: "bookmark-1",
  contentType: "text",
  isRead: false,
} as ApplicationBookmark;

afterEach(() => {
  bookmarksStore.getState().reset();
  bookmarkCapturesStore.getState().reset();
});

describe("Bookmark Page-capture retention", () => {
  it("keeps an Unread text capture and removes it on Archive", () => {
    bookmarksStore.getState().upsert(bookmark);
    bookmarkCapturesStore.getState().upsert(capture);
    expect(bookmarkCapturesStore.getState().capturesDict[bookmark.id]).toEqual(
      capture,
    );

    bookmarksStore.getState().upsert({ ...bookmark, isRead: true });
    expect(
      bookmarkCapturesStore.getState().capturesDict[bookmark.id],
    ).toBeUndefined();
  });

  it("removes the capture with deleted Bookmark metadata", () => {
    bookmarksStore.getState().upsert(bookmark);
    bookmarkCapturesStore.getState().upsert(capture);

    bookmarksStore.getState().remove(bookmark.id);

    expect(
      bookmarkCapturesStore.getState().capturesDict[bookmark.id],
    ).toBeUndefined();
  });
});
