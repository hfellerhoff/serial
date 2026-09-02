import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Jotai from "jotai";
import { useFeedItemActions } from "~/lib/hooks/useFeedItemActions";

const mocks = vi.hoisted(() => ({
  refreshNavigationAfterFeedItemChangeIfNeeded: vi.fn(),
  refreshNavigationSnapshotSafely: vi.fn().mockResolvedValue(undefined),
  resolveOptimisticWatchedValue: vi.fn(),
  setWatchedValue: vi.fn(),
  isDataSubscriptionConnected: vi.fn(() => true),
}));

vi.mock("react", () => ({
  useCallback: <T extends (...args: never[]) => unknown>(callback: T) =>
    callback,
}));
vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal<typeof Jotai>()),
  useAtomValue: () => "connected",
}));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("~/lib/orpc", () => ({
  orpcRouterClient: {
    feedItem: {
      setWatchedValue: mocks.setWatchedValue,
      setWatchLaterValue: vi.fn(),
    },
  },
}));
vi.mock("~/lib/data/store", () => ({
  feedItemsStore: {
    getState: () => ({
      feedItemsDict: {
        "saved-item": {
          id: "saved-item",
          feedId: 1,
          isWatched: true,
          isWatchLater: true,
        },
      },
    }),
  },
  useFeedItemValue: () => ({
    id: "saved-item",
    feedId: 1,
    isWatched: false,
    isWatchLater: true,
  }),
  useHasRetainedFeedItemBody: () => false,
}));
vi.mock("~/lib/data/navigation/refreshOnLocalTransition", () => ({
  refreshNavigationAfterFeedItemChangeIfNeeded:
    mocks.refreshNavigationAfterFeedItemChangeIfNeeded,
}));
vi.mock("~/lib/data/feed-items/mutations", () => ({
  applyOptimisticWatchedValue: vi.fn(() => ({ id: "saved-item" })),
  applyOptimisticWatchLaterValue: vi.fn(),
  resolveOptimisticWatchedValue: mocks.resolveOptimisticWatchedValue,
  resolveOptimisticWatchLaterValue: vi.fn(),
  rollbackOptimisticWatchedValue: vi.fn(),
  rollbackOptimisticWatchLaterValue: vi.fn(),
}));
vi.mock("~/lib/data/feeds/store", () => ({
  useFeeds: () => [],
}));
vi.mock("~/lib/data/navigation/store", () => ({
  refreshNavigationSnapshotSafely: mocks.refreshNavigationSnapshotSafely,
}));
vi.mock("~/lib/data/subscriptionConnection", () => ({
  isDataSubscriptionConnected: mocks.isDataSubscriptionConnected,
}));
vi.mock("~/lib/root-scroll-restoration", () => ({
  captureRootScrollRestoration: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isDataSubscriptionConnected.mockReturnValue(true);
  mocks.setWatchedValue.mockResolvedValue({
    id: "saved-item",
    isWatched: true,
  });
});

describe("connected Feed item action revalidation", () => {
  it("leaves repair to the committed server invalidation", async () => {
    const actions = useFeedItemActions("saved-item");

    expect(actions.toggleRead()).toBe(true);
    await vi.waitFor(() =>
      expect(mocks.resolveOptimisticWatchedValue).toHaveBeenCalledOnce(),
    );

    expect(
      mocks.refreshNavigationAfterFeedItemChangeIfNeeded,
    ).not.toHaveBeenCalled();
    expect(mocks.refreshNavigationSnapshotSafely).not.toHaveBeenCalled();
    expect(mocks.setWatchedValue).toHaveBeenCalledWith({
      id: "saved-item",
      feedId: 1,
      isWatched: true,
    });
  });

  it("waits for full reconnect recovery when the subscription is disconnected", async () => {
    mocks.isDataSubscriptionConnected.mockReturnValue(false);
    const actions = useFeedItemActions("saved-item");

    expect(actions.toggleRead()).toBe(true);
    await vi.waitFor(() =>
      expect(mocks.resolveOptimisticWatchedValue).toHaveBeenCalledOnce(),
    );
    expect(mocks.refreshNavigationSnapshotSafely).not.toHaveBeenCalled();
    expect(
      mocks.refreshNavigationAfterFeedItemChangeIfNeeded,
    ).not.toHaveBeenCalled();
  });
});
