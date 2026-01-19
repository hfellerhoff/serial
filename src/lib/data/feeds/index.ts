import { useEffect } from "react";
import {
  useFeedsFetchStatus,
  useFeeds as useFeedsStore,
  useFetchFeeds,
  useSetFeeds,
} from "./store";

export function useFeedsQuery() {
  const fetchFeeds = useFetchFeeds();
  const fetchStatus = useFeedsFetchStatus();

  useEffect(() => {
    if (fetchStatus === "idle") {
      void fetchFeeds();
    }
  }, [fetchStatus, fetchFeeds]);

  return {
    isLoading: fetchStatus === "fetching",
    isSuccess: fetchStatus === "success",
  };
}

export function useFeeds() {
  const feeds = useFeedsStore();
  const setFeeds = useSetFeeds();
  const fetchStatus = useFeedsFetchStatus();
  const feedsQuery = useFeedsQuery();

  return {
    feeds,
    setFeeds,
    feedsQuery,
    hasFetchedFeeds: fetchStatus === "success",
  };
}
