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

  // Hide when importing (ImportLoading handles that) or when no feeds
  if (!hasFeeds || isImporting) {
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
