import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import { bookmarkCapturesStore } from "~/lib/data/bookmarks/capture-store";
import { reacquireRetainedCapture } from "~/lib/data/bookmarks/mutations";
import { bookmarksStore } from "~/lib/data/bookmarks/store";

const mocks = vi.hoisted(() => ({
  getCapture: vi.fn(),
}));

vi.mock("~/lib/orpc", () => ({
  orpc: {
    bookmark: {
      save: { mutationOptions: (options: unknown) => options },
      updateState: { mutationOptions: (options: unknown) => options },
      setView: { mutationOptions: (options: unknown) => options },
      setTag: { mutationOptions: (options: unknown) => options },
      delete: { mutationOptions: (options: unknown) => options },
    },
  },
  orpcRouterClient: {
    bookmark: { getCapture: mocks.getCapture },
  },
}));

const bookmark = {
  id: "bookmark-1",
  contentType: "text",
  isSaved: true,
  isRead: false,
  captureHash: "capture-hash",
} as ApplicationBookmark;

const capture = {
  bookmarkId: bookmark.id,
  contentHtml: "<p>Reacquired capture</p>",
  contentHash: "capture-hash",
  captureSource: "server-static-fetch" as const,
  extractorVersion: "test",
  sanitizerPolicyVersion: 1,
  capturedAt: new Date("2026-08-31T12:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  bookmarksStore.getState().reset();
  bookmarkCapturesStore.getState().reset();
});

describe("reacquireRetainedCapture", () => {
  it("fetches and persists the capture for a retain-eligible Bookmark", async () => {
    bookmarksStore.getState().upsert(bookmark);
    mocks.getCapture.mockResolvedValue({ status: "capture", capture });

    await reacquireRetainedCapture(bookmark);

    expect(mocks.getCapture).toHaveBeenCalledWith({
      bookmarkId: bookmark.id,
    });
    expect(bookmarkCapturesStore.getState().capturesDict[bookmark.id]).toEqual(
      capture,
    );
  });

  it("skips the fetch when the capture is already retained", async () => {
    bookmarksStore.getState().upsert(bookmark);
    bookmarkCapturesStore.getState().upsert(capture);

    await reacquireRetainedCapture(bookmark);

    expect(mocks.getCapture).not.toHaveBeenCalled();
  });

  it("skips ineligible Bookmarks", async () => {
    await reacquireRetainedCapture({ ...bookmark, isRead: true });
    await reacquireRetainedCapture({ ...bookmark, isSaved: false });
    await reacquireRetainedCapture({ ...bookmark, captureHash: null });

    expect(mocks.getCapture).not.toHaveBeenCalled();
  });

  it("discards the response when retention flipped mid-flight", async () => {
    bookmarksStore.getState().upsert(bookmark);
    mocks.getCapture.mockImplementation(() => {
      // An Archive lands while the capture request is in flight.
      bookmarksStore.getState().upsert({ ...bookmark, isRead: true });
      return Promise.resolve({ status: "capture", capture });
    });

    await reacquireRetainedCapture(bookmark);

    expect(
      bookmarkCapturesStore.getState().capturesDict[bookmark.id],
    ).toBeUndefined();
  });

  it("discards the response after sign-out cleared the store", async () => {
    bookmarksStore.getState().upsert(bookmark);
    mocks.getCapture.mockImplementation(() => {
      bookmarksStore.getState().reset();
      return Promise.resolve({ status: "capture", capture });
    });

    await reacquireRetainedCapture(bookmark);

    expect(bookmarkCapturesStore.getState().capturesDict).toEqual({});
  });
});
