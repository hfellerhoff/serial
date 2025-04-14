import clsx from "clsx";
import ResponsiveVideo from "~/components/ResponsiveVideo";
import { VideoActions } from "./VideoActions";
import { useState, useEffect } from "react";
import { useKeyboard } from "~/components/KeyboardProvider";

export function VideoDisplay({
  id,
  isInactive,
}: {
  id: string;
  isInactive: boolean;
}) {
  const [showVideo, setShowVideo] = useState(false);
  const { view } = useKeyboard();

  useEffect(() => {
    const timeout = setTimeout(() => {
      setShowVideo(true);
    }, 250);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

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
          <ResponsiveVideo videoID={id} isInactive={isInactive} />
        </div>
      </div>
      <VideoActions videoID={id} />
    </>
  );
}
