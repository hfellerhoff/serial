import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFeedItemActions } from "~/lib/hooks/useFeedItemActions";

const mocks = vi.hoisted(() => ({
  refreshNavigationSnapshotSafely: vi.fn().mockResolvedValue(undefined),
  resolveOptimisticWatchedValue: vi.fn(),
  setWatchedValue: vi.fn(),
  isDataSubscriptionConnected: vi.fn(() => true),
}));

vi.mock("react", () => ({
  useCallback: <T extends (...args: never[]) => unknown>(callback: T) =>
    callback,
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
  useFeedItemValue: () => ({
    id: "saved-item",
    feedId: 1,
    isWatched: false,
    isWatchLater: true,
  }),
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
vi.mock("~/lib/data/clientChannel", () => ({
  getDataSubscriptionClientId: () => "connected-client",
}));
vi.mock("~/lib/data/subscriptionConnection", () => ({
  isDataSubscriptionConnected: mocks.isDataSubscriptionConnected,
}));
vi.mock("~/lib/scroll", () => ({ saveHomeScrollPosition: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isDataSubscriptionConnected.mockReturnValue(true);
  mocks.setWatchedValue.mockResolvedValue({
    id: "saved-item",
    isWatched: true,
  });
});

describe("connected Feed item action revalidation", () => {
  it("leaves navigation snapshot refresh to the subscription echo", async () => {
    const actions = useFeedItemActions("saved-item");

    expect(actions.toggleRead()).toBe(true);
    await vi.waitFor(() =>
      expect(mocks.resolveOptimisticWatchedValue).toHaveBeenCalledOnce(),
    );

    expect(mocks.refreshNavigationSnapshotSafely).not.toHaveBeenCalled();
  });

  it("refreshes directly once when the subscription is disconnected", async () => {
    mocks.isDataSubscriptionConnected.mockReturnValue(false);
    const actions = useFeedItemActions("saved-item");

    expect(actions.toggleRead()).toBe(true);
    await vi.waitFor(() =>
      expect(mocks.refreshNavigationSnapshotSafely).toHaveBeenCalledOnce(),
    );
  });
});
