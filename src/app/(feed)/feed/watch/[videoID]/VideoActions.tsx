import { ClockIcon, EyeIcon, EyeOffIcon, CheckIcon } from "lucide-react";
import { useKeyboard } from "~/components/KeyboardProvider";
import { Button } from "~/components/ui/button";
import {
  useFeedItemsQuery,
  useFeedItemsSetWatchedValueMutation,
  useFeedItemsSetWatchLaterValueMutation,
} from "~/lib/data/feedItems";
import { useMediaQuery } from "~/lib/hooks/use-media-query";

export function VideoActions({ videoID }: { videoID: string }) {
  const { view } = useKeyboard();

  const { data: allFeedItems } = useFeedItemsQuery();
  const { mutateAsync: setWatchedValue } =
    useFeedItemsSetWatchedValueMutation();
  const { mutateAsync: setWatchLaterValue } =
    useFeedItemsSetWatchLaterValueMutation();

  const video = allFeedItems?.find((item) => item.contentId === videoID);

  const isWatched = video?.isWatched;
  const isWatchLater = video?.isWatchLater;

  const shouldHideFullscreenActions = useMediaQuery("(min-aspect-ratio: 4/3)");

  if (!video) return null;

  if (view === "fullscreen") {
    if (shouldHideFullscreenActions) return null;

    return (
      <div className="absolute inset-x-0 bottom-0 z-0 flex w-full items-center justify-center gap-2 p-6">
        <Button
          variant={isWatchLater ? "secondary" : "outline"}
          onClick={async () => {
            await setWatchLaterValue({
              contentId: video.contentId,
              feedId: video.feedId!,
              isWatchLater: !video.isWatchLater,
            });
          }}
          size="icon"
        >
          {isWatchLater ? <CheckIcon size={16} /> : <ClockIcon size={16} />}
        </Button>
        <Button
          variant={isWatched ? "secondary" : "outline"}
          onClick={async () => {
            await setWatchedValue({
              contentId: video.contentId,
              feedId: video.feedId!,
              isWatched: !video.isWatched,
            });
          }}
          size="icon"
        >
          {isWatched ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full items-center justify-center gap-2 p-6">
      <Button
        variant={isWatchLater ? "secondary" : "outline"}
        onClick={async () => {
          await setWatchLaterValue({
            contentId: video.contentId,
            feedId: video.feedId!,
            isWatchLater: !video.isWatchLater,
          });
        }}
      >
        {isWatchLater ? <CheckIcon size={16} /> : <ClockIcon size={16} />}
        <span className="pl-1.5 md:pr-1.5">Watch Later</span>
        <kbd className="bg-muted hidden rounded px-1 md:inline-block">w</kbd>
      </Button>
      <Button
        variant={isWatched ? "secondary" : "outline"}
        onClick={async () => {
          await setWatchedValue({
            contentId: video.contentId,
            feedId: video.feedId!,
            isWatched: !video.isWatched,
          });
        }}
      >
        {isWatched ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
        <span className="pl-1.5 md:pr-1.5">
          {isWatched ? "Watched" : "Unwatched"}
        </span>
        <kbd className="bg-muted hidden rounded px-1 md:inline-block">e</kbd>
      </Button>
    </div>
  );
}
