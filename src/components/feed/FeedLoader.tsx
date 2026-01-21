import clsx from "clsx";
import { Progress } from "~/components/ui/progress";
import { useFetchFeedItemsStatus, useLoadingProgress } from "~/lib/data/store";

export function FeedLoader() {
  const status = useFetchFeedItemsStatus();
  const progress = useLoadingProgress();

  const isFetching = status === "fetching";

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
