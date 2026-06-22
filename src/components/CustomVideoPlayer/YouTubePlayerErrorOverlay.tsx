import clsx from "clsx";
import { ExternalLinkIcon } from "lucide-react";

type YouTubePlayerErrorOverlayProps = {
  errorMessage: string;
  isInactive: boolean;
  onWatchOnYouTube: () => void;
  orientation: "vertical" | "horizontal";
  videoID: string;
};

export function YouTubePlayerErrorOverlay({
  errorMessage,
  isInactive,
  onWatchOnYouTube,
  orientation,
  videoID,
}: YouTubePlayerErrorOverlayProps) {
  return (
    <div className="absolute inset-0 z-40 h-full w-full">
      <div className="absolute inset-0 h-full w-full bg-black">
        <img
          className={clsx("h-full w-full", {
            "object-cover": orientation === "vertical",
            "object-contain": orientation === "horizontal",
          })}
          alt=""
          src={`https://img.youtube.com/vi/${videoID}/maxresdefault.jpg`}
        />
      </div>
      <button
        aria-label={errorMessage}
        onClick={onWatchOnYouTube}
        className={clsx(
          "absolute inset-0 inset-y-8 z-20 grid place-items-center",
          {
            "cursor-pointer": !isInactive,
            "cursor-none!": isInactive,
          },
        )}
      >
        <div className="bg-background flex min-h-20 max-w-[calc(100%-2rem)] flex-wrap items-center justify-center gap-2 rounded-2xl px-4 text-sm font-medium shadow-2xl transition-all group-hover:scale-105 sm:px-6 sm:text-base">
          <span>Watch on YouTube</span>
          <ExternalLinkIcon size={18} />
        </div>
      </button>
    </div>
  );
}
