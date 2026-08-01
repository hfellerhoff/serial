import clsx from "clsx";
import { ExternalLinkIcon } from "lucide-react";
import { Button } from "../ui/button";

type YouTubePlayerErrorOverlayProps = {
  errorMessage: string;
  isInactive: boolean;
  originActionLabel: string;
  onOpenOrigin: () => void;
};

export function YouTubePlayerErrorOverlay({
  errorMessage,
  isInactive,
  originActionLabel,
  onOpenOrigin,
}: YouTubePlayerErrorOverlayProps) {
  return (
    <div
      role="alert"
      className={clsx(
        "absolute inset-0 z-40 grid h-full w-full place-items-center bg-black p-6 text-white",
        {
          "cursor-none!": isInactive,
        },
      )}
    >
      <div className="flex flex-col items-center gap-6 text-center">
        <div>
          <p className="text-2xl font-semibold sm:text-3xl">
            Something went wrong
          </p>
          <p className="sr-only">{errorMessage}</p>
        </div>
        <Button
          onClick={onOpenOrigin}
          variant="outline"
          size="lg"
          className="gap-2 border-white bg-white text-black shadow-lg hover:bg-neutral-100 hover:text-black"
        >
          <span>{originActionLabel}</span>
          <ExternalLinkIcon aria-hidden="true" size={18} />
        </Button>
      </div>
    </div>
  );
}
