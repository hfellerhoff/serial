import clsx from "clsx";
import ResponsiveVideo from "~/components/ResponsiveVideo";
import { VideoActions } from "./VideoActions";
import { useState, useEffect } from "react";
import { useKeyboard } from "~/components/KeyboardProvider";

export function VideoDisplay({ id }: { id: string }) {
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
      <div className="relative z-10 w-full">
        <div
          className={clsx(
            "absolute top-0 aspect-video w-full animate-pulse overflow-hidden bg-muted transition-opacity",
            {
              rounded: view === "windowed",
            },
          )}
        />
        <div
          className={clsx("w-full overflow-hidden transition-opacity", {
            rounded: view === "windowed",
            "opacity-0": !showVideo,
            "opacity-100": showVideo,
          })}
        >
          <ResponsiveVideo videoID={id} />
        </div>
      </div>
      <VideoActions videoID={id} />
    </>
  );
}
