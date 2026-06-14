import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BookmarkCheckIcon,
  BookmarkIcon,
  CheckIcon,
  SendIcon,
} from "lucide-react";
import { useView } from "./useView";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { Button } from "~/components/ui/button";
import {
  useFeedItemsSetWatchedValueMutation,
  useFeedItemsSetWatchLaterValueMutation,
} from "~/lib/data/feed-items/mutations";
import {
  useSaveToInstapaperMutation,
  useShowInstapaperAction,
} from "~/lib/data/instapaper";
import { useFeedItemValue } from "~/lib/data/store";
import { useMediaQuery } from "~/lib/hooks/use-media-query";
import { useShortcut } from "~/lib/hooks/useShortcut";
import { SHORTCUT_KEYS } from "~/lib/constants/shortcuts";

export function ContentActions({ contentID }: { contentID: string }) {
  const { view } = useView();

  const video = useFeedItemValue(contentID);

  const { mutateAsync: setWatchedValue } =
    useFeedItemsSetWatchedValueMutation(contentID);
  const { mutateAsync: setWatchLaterValue } =
    useFeedItemsSetWatchLaterValueMutation(contentID);

  const showInstapaperAction = useShowInstapaperAction(contentID);
  const { mutateAsync: saveToInstapaper, isPending: isSavingToInstapaper } =
    useSaveToInstapaperMutation(contentID);

  const isWatched = video?.isWatched;
  const isWatchLater = video?.isWatchLater;

  const shouldHideFullscreenActions = useMediaQuery("(min-aspect-ratio: 4/3)");

  const toggleWatchLater = async () => {
    if (!video) return;
    await setWatchLaterValue({
      id: video.id,
      feedId: video.feedId,
      isWatchLater: !video.isWatchLater,
    });
  };

  useShortcut(SHORTCUT_KEYS.TOGGLE_SAVED, () => {
    void toggleWatchLater();
  });

  const toggleWatched = async () => {
    if (!video) return;
    await setWatchedValue({
      id: video.id,
      feedId: video.feedId,
      isWatched: !video.isWatched,
    });
  };

  useShortcut(SHORTCUT_KEYS.TOGGLE_READ, () => {
    void toggleWatched();
  });

  const handleSaveToInstapaper = async () => {
    if (!video || !showInstapaperAction) return;
    await saveToInstapaper({ feedItemId: video.id });
  };

  useShortcut(SHORTCUT_KEYS.SEND_TO_INSTAPAPER, () => {
    void handleSaveToInstapaper();
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
          {isWatchLater ? (
            <CheckIcon size={16} />
          ) : (
            <BookmarkCheckIcon size={16} />
          )}
        </Button>
        <Button
          variant={isWatched ? "secondary" : "outline"}
          onClick={toggleWatched}
          size="icon"
        >
          {isWatched ? (
            <ArchiveRestoreIcon size={16} />
          ) : (
            <ArchiveIcon size={16} />
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full items-center justify-center gap-2 p-6">
      {showInstapaperAction && (
        <ButtonWithShortcut
          shortcut={SHORTCUT_KEYS.SEND_TO_INSTAPAPER}
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
        shortcut={SHORTCUT_KEYS.TOGGLE_SAVED}
        variant={isWatchLater ? "secondary" : "outline"}
        onClick={toggleWatchLater}
        size="icon md:default"
      >
        {isWatchLater ? (
          <BookmarkCheckIcon size={16} />
        ) : (
          <BookmarkIcon size={16} />
        )}
        <span className="hidden pl-1.5 md:block">
          {isWatchLater ? "Unsave" : "Save"}
        </span>
      </ButtonWithShortcut>
      <ButtonWithShortcut
        shortcut={SHORTCUT_KEYS.TOGGLE_READ}
        variant={isWatched ? "secondary" : "outline"}
        onClick={toggleWatched}
        size="icon md:default"
      >
        {isWatched ? (
          <ArchiveRestoreIcon size={16} />
        ) : (
          <ArchiveIcon size={16} />
        )}
        <span className="hidden pl-1.5 md:block">
          {isWatched ? "Unarchive" : "Archive"}
        </span>
      </ButtonWithShortcut>
    </div>
  );
}
