import clsx from "clsx";
import { useEffect, useState } from "react";
import ResponsiveVideo from "~/components/ResponsiveVideo";
import { useFeedItemValue } from "~/lib/data/store";
import { useShortcut } from "~/lib/hooks/useShortcut";
import { ContentActions } from "./ContentActions";
import { useVideoNavigationShortcuts } from "./useVideoNavigationShortcuts";
import { useView } from "./useView";

export function VideoDisplay({
  id,
  isInactive,
}: {
  id: string;
  isInactive: boolean;
}) {
  const item = useFeedItemValue(id);
  const [showVideo, setShowVideo] = useState(false);

  const { view, toggleView } = useView();

  useShortcut("`", toggleView);
  useShortcut("f", toggleView);

  useVideoNavigationShortcuts();

  useEffect(() => {
    const timeout = setTimeout(() => {
      setShowVideo(true);
    }, 250);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  if (!item) return null;

  return (
    <>
      <div
        className={clsx("relative z-10 w-full", {
          "h-fit": view === "windowed",
          "h-full": view === "fullscreen",
        })}
      >
        <div
          className={clsx(
            "bg-muted absolute top-0 aspect-video w-full animate-pulse overflow-hidden transition-opacity",
            {
              "aspect-video rounded": view === "windowed",
              "h-full": view === "fullscreen",
            },
          )}
        />
        <div
          className={clsx("w-full overflow-hidden transition-opacity", {
            "aspect-video rounded": view === "windowed",
            "h-full": view === "fullscreen",
            "opacity-0": !showVideo,
            "opacity-100": showVideo,
          })}
        >
          <ResponsiveVideo videoID={item.contentId} isInactive={isInactive} />
        </div>
      </div>
      <ContentActions contentID={id} />
    </>
  );
}
