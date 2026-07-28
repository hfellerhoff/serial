import {
  useFeedsFetchStatus,
  useFeeds as useFeedsStore,
  useSetFeeds,
} from "./store";

export function useFeeds() {
  const feeds = useFeedsStore();
  const setFeeds = useSetFeeds();
  const fetchStatus = useFeedsFetchStatus();

  return {
    feeds,
    setFeeds,
    hasFetchedFeeds: fetchStatus === "success",
  };
}
