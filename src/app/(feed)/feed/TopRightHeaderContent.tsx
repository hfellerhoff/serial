"use client";

import { ExternalLinkIcon, MinusIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { CustomVideoButton } from "~/components/CustomVideoButton";
import { Button } from "~/components/ui/button";
import { useSidebar } from "~/components/ui/sidebar";
import { useFeedItemGlobalState } from "~/lib/data/atoms";
import { useShortcut } from "~/lib/hooks/useShortcut";
import { OpenRightSidebarButton } from "./OpenRightSidebarButton";
import { RefetchItemsButton } from "./RefetchItemsButton";
import { MAX_ZOOM, MIN_ZOOM, useZoom } from "./watch/[videoID]/useZoom";

const PLATFORM_TO_FORMATTED_NAME = {
  youtube: "YouTube",
  peertube: "PeerTube",
} as const;

function OpenInYouTubeButton() {
  const pathname = usePathname();
  const videoId = pathname.split("/feed/watch/")[1]!;
  const [feedItem] = useFeedItemGlobalState(videoId ?? "");

  // If not a Serial item, assume YouTube
  if (!feedItem) {
    return (
      <Link
        href={`https://www.youtube.com/watch?v=${videoId}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Button variant="outline" size="icon md:default">
          <span className="hidden pr-1.5 md:block">YouTube</span>
          <ExternalLinkIcon size={16} />
        </Button>
      </Link>
    );
  }

  return (
    <Link href={feedItem.url} target="_blank" rel="noopener noreferrer">
      <Button variant="outline" size="icon md:default">
        <span className="hidden pr-1.5 md:block">
          {PLATFORM_TO_FORMATTED_NAME[feedItem.platform]}
        </span>
        <ExternalLinkIcon size={16} />
      </Button>
    </Link>
  );
}

export function TopRightHeaderContent() {
  const pathname = usePathname();

  const { isMobile } = useSidebar();
  const { zoom, zoomIn, zoomOut } = useZoom();

  useShortcut("=", zoomIn);
  useShortcut("-", zoomOut);

  if (pathname.includes("/feed/watch/")) {
    if (isMobile) {
      return (
        <div className="flex items-center gap-2">
          <OpenInYouTubeButton />
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <ButtonWithShortcut
          variant="outline"
          shortcut="-"
          size="icon"
          onClick={zoomOut}
          disabled={zoom === MIN_ZOOM}
        >
          <MinusIcon size={16} />
        </ButtonWithShortcut>
        <ButtonWithShortcut
          variant="outline"
          shortcut="+"
          size="icon"
          onClick={zoomIn}
          disabled={zoom === MAX_ZOOM}
        >
          <PlusIcon size={16} />
        </ButtonWithShortcut>
        <OpenInYouTubeButton />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="md:hidden">
        <CustomVideoButton />
      </div>
      <RefetchItemsButton />
      <div className="md:hidden">
        <OpenRightSidebarButton />
      </div>
    </div>
  );
}
