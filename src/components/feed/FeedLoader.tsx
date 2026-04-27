import { Progress } from "~/components/ui/progress";
import { useLoadingMode } from "~/lib/data/loading-machine";
import { useFeeds } from "~/lib/data/feeds/store";

export function FeedLoader() {
  const loading = useLoadingMode();
  const feeds = useFeeds();

  if (
    feeds.length === 0 ||
    loading.mode !== "backgroundRefresh" ||
    loading.progress <= 0
  ) {
    return null;
  }

  return (
    <div className="w-32">
      <Progress value={loading.progress} className="w-full" />
    </div>
  );
}
