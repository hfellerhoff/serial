import { ClockIcon, EyeIcon, EyeOffIcon, CheckIcon } from "lucide-react";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { useKeyboard } from "~/components/KeyboardProvider";
import { Button } from "~/components/ui/button";
import { useFeedItemGlobalState } from "~/lib/data/atoms";
import {
  useFeedItemsSetWatchedValueMutation,
  useFeedItemsSetWatchLaterValueMutation,
} from "~/lib/data/feed-items/mutations";
import { useMediaQuery } from "~/lib/hooks/use-media-query";

export function VideoActions({ videoID }: { videoID: string }) {
  const { view } = useKeyboard();

  const [video] = useFeedItemGlobalState(videoID);

  const { mutateAsync: setWatchedValue } =
    useFeedItemsSetWatchedValueMutation(videoID);
  const { mutateAsync: setWatchLaterValue } =
    useFeedItemsSetWatchLaterValueMutation(videoID);

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
      <ButtonWithShortcut
        shortcut="w"
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
        <span className="pl-1.5">Watch Later</span>
      </ButtonWithShortcut>
      <ButtonWithShortcut
        shortcut="e"
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
        <span className="pl-1.5">{isWatched ? "Watched" : "Unwatched"}</span>
      </ButtonWithShortcut>
    </div>
  );
}
