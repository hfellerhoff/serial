// @vitest-environment jsdom

import { getDefaultStore } from "jotai";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectionStateAtom } from "~/lib/data/atoms";
import { useSaveBookmarkVideoProgress } from "~/lib/hooks/useSaveBookmarkVideoProgress";
import { useSaveProgress } from "~/lib/hooks/useSaveProgress";

const mocks = vi.hoisted(() => ({
  saveBookmarkProgress: vi.fn(),
  saveFeedProgress: vi.fn(),
}));

vi.mock("~/lib/data/feed-items/mutations", () => ({
  useSetProgressMutation: () => ({ mutate: mocks.saveFeedProgress }),
}));

vi.mock("~/lib/data/store", () => ({
  useFeedItemValue: () => ({ id: "feed-item", feedId: 1 }),
}));

vi.mock("~/lib/data/bookmarks", () => ({
  useBookmarkValue: () => ({ id: "bookmark" }),
}));

vi.mock("~/lib/data/bookmarks/mutations", () => ({
  useUpdateBookmarkStateMutation: () => ({
    mutate: mocks.saveBookmarkProgress,
  }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Array<ReturnType<typeof createRoot>> = [];

function ProgressHarness() {
  useSaveProgress({
    contentId: "feed-item",
    enabled: true,
    getProgress: () => ({ progress: 4, duration: 10 }),
  });
  useSaveBookmarkVideoProgress({
    bookmarkId: "bookmark",
    enabled: true,
    getProgress: () => ({ progress: 5, duration: 12 }),
  });
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  getDefaultStore().set(connectionStateAtom, "disconnected");
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  getDefaultStore().set(connectionStateAtom, "unknown");
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("offline video progress", () => {
  it("blocks interval and unmount writes while disconnected", () => {
    const root = createRoot(document.createElement("div"));
    roots.push(root);
    act(() => root.render(createElement(ProgressHarness)));

    act(() => vi.advanceTimersByTime(30_000));
    expect(mocks.saveFeedProgress).not.toHaveBeenCalled();
    expect(mocks.saveBookmarkProgress).not.toHaveBeenCalled();

    act(() => root.unmount());
    roots.splice(roots.indexOf(root), 1);
    expect(mocks.saveFeedProgress).not.toHaveBeenCalled();
    expect(mocks.saveBookmarkProgress).not.toHaveBeenCalled();
  });
});
