import {
  CheckIcon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  SendIcon,
} from "lucide-react";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { Button } from "~/components/ui/button";
import {
  useFeedItemsSetWatchedValueMutation,
  useFeedItemsSetWatchLaterValueMutation,
} from "~/lib/data/feed-items/mutations";
import {
  useInstapaperConnectionStatus,
  useSaveToInstapaperMutation,
} from "~/lib/data/instapaper";
import { useFeedItemValue } from "~/lib/data/store";
import { useMediaQuery } from "~/lib/hooks/use-media-query";
import { useShortcut } from "~/lib/hooks/useShortcut";
import { useView } from "./useView";

export function ContentActions({ contentID }: { contentID: string }) {
  const { view } = useView();

  const video = useFeedItemValue(contentID);

  const { mutateAsync: setWatchedValue } =
    useFeedItemsSetWatchedValueMutation(contentID);
  const { mutateAsync: setWatchLaterValue } =
    useFeedItemsSetWatchLaterValueMutation(contentID);

  const { data: instapaperStatus } = useInstapaperConnectionStatus();
  const { mutateAsync: saveToInstapaper, isPending: isSavingToInstapaper } =
    useSaveToInstapaperMutation(contentID);

  const isWatched = video?.isWatched;
  const isWatchLater = video?.isWatchLater;

  const shouldHideFullscreenActions = useMediaQuery("(min-aspect-ratio: 4/3)");

  const toggleWatchLater = async () => {
    if (!video) return;
    await setWatchLaterValue({
      id: video.id,
      feedId: video.feedId!,
      isWatchLater: !video.isWatchLater,
    });
  };

  useShortcut("w", () => {
    void toggleWatchLater();
  });

  const toggleWatched = async () => {
    if (!video) return;
    await setWatchedValue({
      id: video.id,
      feedId: video.feedId!,
      isWatched: !video.isWatched,
    });
  };

  useShortcut("e", () => {
    void toggleWatched();
  });

  const handleSaveToInstapaper = async () => {
    if (!video || !instapaperStatus?.isConnected) return;
    await saveToInstapaper({ feedItemId: video.id });
  };

  const showInstapaperAction =
    instapaperStatus?.isConfigured &&
    instapaperStatus?.isConnected &&
    video?.platform === "website";

  useShortcut("s", () => {
    if (showInstapaperAction) {
      void handleSaveToInstapaper();
    }
  });

  if (!video) return null;

  if (view === "fullscreen") {
    if (shouldHideFullscreenActions) return null;

    return (
      <div className="absolute inset-x-0 bottom-0 z-0 flex w-full items-center justify-center gap-2 p-6">
        {showInstapaperAction && (
          <Button
            variant="outline"
            onClick={handleSaveToInstapaper}
            size="icon"
            disabled={isSavingToInstapaper}
          >
            <SendIcon size={16} />
          </Button>
        )}
        <Button
          variant={isWatchLater ? "secondary" : "outline"}
          onClick={toggleWatchLater}
          size="icon"
        >
          {isWatchLater ? <CheckIcon size={16} /> : <ClockIcon size={16} />}
        </Button>
        <Button
          variant={isWatched ? "secondary" : "outline"}
          onClick={toggleWatched}
          size="icon"
        >
          {isWatched ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full items-center justify-center gap-2 p-6">
      {showInstapaperAction && (
        <ButtonWithShortcut
          shortcut="s"
          variant="outline"
          onClick={handleSaveToInstapaper}
          disabled={isSavingToInstapaper}
          size="icon md:default"
        >
          <SendIcon size={16} />
          <span className="hidden pl-1.5 md:block">Instapaper</span>
        </ButtonWithShortcut>
      )}
      <ButtonWithShortcut
        shortcut="w"
        variant={isWatchLater ? "secondary" : "outline"}
        onClick={toggleWatchLater}
        size="icon md:default"
      >
        {isWatchLater ? <CheckIcon size={16} /> : <ClockIcon size={16} />}
        <span className="hidden pl-1.5 md:block">Watch Later</span>
      </ButtonWithShortcut>
      <ButtonWithShortcut
        shortcut="e"
        variant={isWatched ? "secondary" : "outline"}
        onClick={toggleWatched}
        size="icon md:default"
      >
        {isWatched ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
        <span className="hidden pl-1.5 md:block">
          {isWatched ? "Watched" : "Unwatched"}
        </span>
      </ButtonWithShortcut>
    </div>
  );
}
