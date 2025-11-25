import clsx from "clsx";
import { Progress } from "~/components/ui/progress";
import { useFeeds } from "~/lib/data/feeds";
import { useFeedStatusDict, useFetchFeedItemsStatus } from "~/lib/data/store";

export function FeedLoader() {
  const { feeds } = useFeeds();
  const feedStatusDict = useFeedStatusDict();

  const fetchedFeedsCount = Object.keys(feedStatusDict).length;
  const status = useFetchFeedItemsStatus();

  const isFetching = status === "fetching";

  const value = isFetching ? fetchedFeedsCount : 0;

  return (
    <div
      className={clsx("w-32 transition-opacity", {
        "opacity-0": !isFetching,
        "opacity-100": isFetching,
      })}
    >
      <Progress max={feeds.length} value={value} className="w-full" />
    </div>
  );
}
