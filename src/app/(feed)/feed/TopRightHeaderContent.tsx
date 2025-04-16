"use client";

import { MinusIcon, PlusIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { CustomVideoButton } from "~/components/CustomVideoButton";
import { MAX_ZOOM, MIN_ZOOM, useKeyboard } from "~/components/KeyboardProvider";
import { OpenRightSidebarButton } from "./OpenRightSidebarButton";
import { RefetchItemsButton } from "./RefetchItemsButton";
import { useSidebar } from "~/components/ui/sidebar";

export function TopRightHeaderContent() {
  const pathname = usePathname();

  const { isMobile } = useSidebar();
  const { zoom, zoomIn, zoomOut } = useKeyboard();

  if (pathname.includes("/feed/watch/")) {
    if (isMobile) return null;

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
