import clsx from "clsx";
import { Progress } from "~/components/ui/progress";
import {
  useFetchFeedItemsStatus,
  useLoadingProgress,
  useProgressState,
} from "~/lib/data/store";
import { useFeeds } from "~/lib/data/feeds/store";

export function FeedLoader() {
  const status = useFetchFeedItemsStatus();
  const progress = useLoadingProgress();
  const feeds = useFeeds();
  const progressState = useProgressState();

  const isFetching = status === "fetching";
  const hasFeeds = feeds.length > 0;
  const isImporting = progressState.fetchType === "import";
  const nothingToFetch =
    (progressState.fetchType === "initial" ||
      progressState.fetchType === "refresh") &&
    progressState.totalFeeds === 0;

  // Hide when importing (ImportLoading handles that), when no feeds, or when all feeds are cached
  if (!hasFeeds || isImporting || nothingToFetch) {
    return null;
  }

  return (
    <div
      className={clsx("w-32 transition-opacity", {
        "opacity-0": !isFetching,
        "opacity-100": isFetching,
      })}
    >
      <Progress value={progress} className="w-full" />
    </div>
  );
}
