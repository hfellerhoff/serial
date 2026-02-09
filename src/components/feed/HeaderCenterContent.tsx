"use client";

import { MinusIcon, PlusIcon, SettingsIcon } from "lucide-react";
import { useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { FeedLoader } from "./FeedLoader";
import { MAX_ZOOM, MIN_ZOOM, useZoom } from "./watch/[id]/useZoom";
import { EditFeedDialog } from "~/components/AddFeedDialog";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { ColorThemePopoverButton } from "~/components/color-theme/ColorThemePopoverButton";
import { Button } from "~/components/ui/button";
import { useSidebar } from "~/components/ui/sidebar";
import { useFeedItemValue } from "~/lib/data/store";
import { useShortcut } from "~/lib/hooks/useShortcut";

function EditFeedButton() {
  const { pathname } = useLocation();
  const videoId = pathname.split("/watch/")[1]!;
  const contentId = pathname.split("/read/")[1]!;

  const feedItem = useFeedItemValue(videoId || contentId || "");

  const [selectedFeedForEditing, setSelectedFeedForEditing] = useState<
    null | number
  >(null);

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        onClick={() => {
          setSelectedFeedForEditing(feedItem?.feedId ?? 0);
        }}
      >
        <SettingsIcon size={16} />
      </Button>
      <EditFeedDialog
        selectedFeedId={selectedFeedForEditing}
        onClose={() => setSelectedFeedForEditing(null)}
      />
    </>
  );
}

export function HeaderCenterContent() {
  const { pathname } = useLocation();
  const { isMobile } = useSidebar();
  const { zoom, zoomIn, zoomOut } = useZoom();

  useShortcut("=", zoomIn);
  useShortcut("-", zoomOut);

  if (
    !isMobile &&
    (pathname.includes("/watch/") || pathname.includes("/read/"))
  ) {
    const defaultTab = pathname.includes("/watch/") ? "videos" : "articles";

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
        <ColorThemePopoverButton defaultTab={defaultTab} />
        <EditFeedButton />
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

  return <FeedLoader />;
}
