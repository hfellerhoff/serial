import {
  useViewFeedsFetchStatus,
  useViewFeeds as useViewFeedsStore,
} from "./store";

export function useViewFeeds() {
  const viewFeeds = useViewFeedsStore();
  const fetchStatus = useViewFeedsFetchStatus();

  return {
    viewFeeds,
    hasFetchedViewFeeds: fetchStatus === "success",
  };
}
