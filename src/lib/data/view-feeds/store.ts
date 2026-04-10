import { createStore } from "zustand";
import { createSelectorHooks } from "../createSelectorHooks";
import type { DatabaseViewFeed } from "~/server/db/schema";
import { orpcRouterClient } from "~/lib/orpc";

export type ViewFeedsStore = {
  reset: () => void;
  viewFeeds: DatabaseViewFeed[];
  viewFeedsDict: Record<string, DatabaseViewFeed>;
  fetchStatus: "idle" | "fetching" | "success";
  fetch: () => Promise<void>;
  set: (viewFeeds: DatabaseViewFeed[]) => void;
  add: (viewFeed: DatabaseViewFeed) => void;
  remove: (viewId: number, feedId: number) => void;
};

function getViewFeedKey(viewId: number, feedId: number) {
  return `${viewId}-${feedId}`;
}

const vanillaViewFeedsStore = createStore<ViewFeedsStore>()((set, get) => ({
  reset: () =>
    set({
      viewFeeds: [],
      viewFeedsDict: {},
      fetchStatus: "idle",
    }),
  viewFeeds: [],
  viewFeedsDict: {},
  fetchStatus: "idle",

  fetch: async () => {
    if (get().fetchStatus === "fetching") return;

    set({ fetchStatus: "fetching" });

    const data = await orpcRouterClient.viewFeeds.getAll();

    const dict: Record<string, DatabaseViewFeed> = {};
    data.forEach((vf) => {
      const key = getViewFeedKey(vf.viewId, vf.feedId);
      dict[key] = vf;
    });

    set({
      viewFeeds: data,
      viewFeedsDict: dict,
      fetchStatus: "success",
    });
  },

  set: (viewFeeds) => {
    const dict: Record<string, DatabaseViewFeed> = {};
    viewFeeds.forEach((vf) => {
      const key = getViewFeedKey(vf.viewId, vf.feedId);
      dict[key] = vf;
    });

    set({
      viewFeeds,
      viewFeedsDict: dict,
    });
  },

  add: (viewFeed) => {
    const key = getViewFeedKey(viewFeed.viewId, viewFeed.feedId);

    set({
      viewFeeds: [...get().viewFeeds, viewFeed],
      viewFeedsDict: {
        ...get().viewFeedsDict,
        [key]: viewFeed,
      },
    });
  },

  remove: (viewId, feedId) => {
    const key = getViewFeedKey(viewId, feedId);
    const { [key]: _removed, ...rest } = get().viewFeedsDict;
    void _removed;

    set({
      viewFeeds: get().viewFeeds.filter(
        (vf) => !(vf.viewId === viewId && vf.feedId === feedId),
      ),
      viewFeedsDict: rest,
    });
  },
}));

export const viewFeedsStore = createSelectorHooks(vanillaViewFeedsStore);

export const {
  useViewFeeds,
  useFetchStatus: useViewFeedsFetchStatus,
  useFetch: useFetchViewFeeds,
  useReset: useResetViewFeeds,
} = viewFeedsStore;
