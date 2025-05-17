"use client";

import { ExternalLinkIcon, MinusIcon, PlusIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { CustomVideoButton } from "~/components/CustomVideoButton";
import { MAX_ZOOM, MIN_ZOOM, useKeyboard } from "~/components/KeyboardProvider";
import { OpenRightSidebarButton } from "./OpenRightSidebarButton";
import { RefetchItemsButton } from "./RefetchItemsButton";
import { useSidebar } from "~/components/ui/sidebar";
import Link from "next/link";

function OpenInYouTubeButton() {
  const pathname = usePathname();

  const videoId = pathname.split("/feed/watch/")[1]?.split("?");
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  return (
    <Link href={videoUrl} target="_blank" rel="noopener noreferrer">
      <ButtonWithShortcut variant="outline" shortcut="o" size="icon md:default">
        <span className="hidden pr-1.5 md:block">YouTube</span>
        <ExternalLinkIcon size={16} />
      </ButtonWithShortcut>
    </Link>
  );
}

export function TopRightHeaderContent() {
  const pathname = usePathname();

  const { isMobile } = useSidebar();
  const { zoom, zoomIn, zoomOut } = useKeyboard();

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
