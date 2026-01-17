import { useEffect } from "react";
import {
  useFeeds as useFeedsStore,
  useFeedsFetchStatus,
  useFetchFeeds,
  useSetFeeds,
} from "./store";

export function useFeedsQuery() {
  const fetchFeeds = useFetchFeeds();
  const fetchStatus = useFeedsFetchStatus();

  useEffect(() => {
    if (fetchStatus === "idle") {
      fetchFeeds();
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
