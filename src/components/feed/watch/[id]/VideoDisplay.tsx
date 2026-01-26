import clsx from "clsx";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { ContentActions } from "./ContentActions";
import {
  useVideoNavigation,
  useVideoNavigationShortcuts,
} from "./useVideoNavigationShortcuts";
import { useView } from "./useView";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import ResponsiveVideo from "~/components/ResponsiveVideo";
import { useFeedItemValue } from "~/lib/data/store";

export function VideoDisplay({
  id,
  isInactive,
}: {
  id: string;
  isInactive: boolean;
}) {
  const item = useFeedItemValue(id);
  const [showVideo, setShowVideo] = useState(false);

  const { view } = useView();

  useVideoNavigationShortcuts();

  const { goToPreviousVideo, goToNextVideo, canGoToPrevious, canGoToNext } =
    useVideoNavigation();

  useEffect(() => {
    const timeout = setTimeout(() => {
      setShowVideo(true);
    }, 100);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  if (!item) return null;

  const isVertical = item.orientation === "vertical";
  const showNavButtons = isVertical && view === "windowed";

  return (
    <>
      <div
        className={clsx({
          "relative z-10 h-fit w-full": view === "windowed",
          "relative z-10 h-full w-full": view === "fullscreen",
        })}
      >
        <div
          className={clsx({
            "flex items-center justify-center gap-4": view === "windowed",
            "h-full w-full overflow-hidden transition-opacity":
              view === "fullscreen",
          })}
        >
          {showNavButtons && (
            <ButtonWithShortcut
              shortcut="["
              variant="ghost"
              size="icon"
              onClick={goToPreviousVideo}
              disabled={!canGoToPrevious}
              className={clsx("ml-4 shrink-0", {
                invisible: !canGoToPrevious,
              })}
            >
              <ChevronLeftIcon />
            </ButtonWithShortcut>
          )}
          <div
            className={clsx({
              "relative w-full": view === "windowed",
              "h-full w-full overflow-hidden transition-opacity":
                view === "fullscreen",
            })}
          >
            {view === "windowed" && (
              <div
                className={clsx(
                  "bg-muted absolute top-0 w-full animate-pulse overflow-hidden transition-opacity",
                  {
                    "aspect-video rounded": !isVertical,
                    "aspect-9/16 rounded": isVertical,
                  },
                )}
              />
            )}
            {view === "fullscreen" && (
              <div className="bg-muted absolute top-0 aspect-video h-full w-full animate-pulse overflow-hidden transition-opacity" />
            )}
            <div
              className={clsx({
                [clsx("w-full overflow-hidden transition-opacity", {
                  "aspect-video rounded": !isVertical,
                  "aspect-9/16 rounded": isVertical,
                  "opacity-0": !showVideo,
                  "opacity-100": showVideo,
                })]: view === "windowed",
                "h-full w-full overflow-hidden transition-opacity":
                  view === "fullscreen",
              })}
            >
              <ResponsiveVideo
                videoID={item.contentId}
                feedItemId={id}
                isInactive={isInactive}
              />
            </div>
          </div>
          {showNavButtons && (
            <ButtonWithShortcut
              shortcut="]"
              variant="ghost"
              size="icon"
              onClick={goToNextVideo}
              disabled={!canGoToNext}
              className={clsx("mr-4 shrink-0", {
                invisible: !canGoToNext,
              })}
              shortcutPosition="left"
            >
              <ChevronRightIcon />
            </ButtonWithShortcut>
          )}
        </div>
      </div>
      <ContentActions contentID={id} />
    </>
  );
}
