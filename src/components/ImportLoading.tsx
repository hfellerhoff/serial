import { Loader2Icon } from "lucide-react";
import { Progress } from "~/components/ui/progress";
import {
  useFeedStatusDict,
  useFetchFeedItemsStatus,
  useLoadingProgress,
  useProgressState,
} from "~/lib/data/store";

export function ImportLoading() {
  const status = useFetchFeedItemsStatus();
  const progress = useLoadingProgress();
  const progressState = useProgressState();
  const feedStatusDict = useFeedStatusDict();

  const isFetching = status === "fetching";
  const feedsCompleted = Object.keys(feedStatusDict).length;
  const totalFeeds = progressState.totalFeeds;

  return (
    <div className="bg-background fixed inset-0 flex h-screen w-screen flex-col items-center justify-center">
      {isFetching && totalFeeds > 0 ? (
        <>
          <Progress value={progress} className="w-48" />
          <p className="text-muted-foreground pt-4 font-mono text-sm">
            Importing {feedsCompleted} of {totalFeeds} feeds...
          </p>
        </>
      ) : (
        <Loader2Icon size={32} className="animate-spin" />
      )}
    </div>
  );
}
