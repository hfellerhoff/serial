"use client";

import { ExternalLinkIcon } from "lucide-react";
import { useLocation } from "@tanstack/react-router";
import { OpenRightSidebarButton } from "./OpenRightSidebarButton";
import { RefetchItemsButton } from "./RefetchItemsButton";
import { Button } from "~/components/ui/button";
import { PLATFORM_TO_FORMATTED_NAME_MAP } from "~/lib/data/feeds/utils";
import { useFeedItemValue } from "~/lib/data/store";

function OpenInYouTubeButton() {
  const { pathname } = useLocation();
  const videoId = pathname.split("/watch/")[1]!;
  const contentId = pathname.split("/read/")[1]!;

  const feedItem = useFeedItemValue(videoId || contentId || "");

  // If not a Serial item, assume YouTube
  if (!feedItem) {
    return (
      <a
        href={`https://www.youtube.com/watch?v=${videoId}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Button variant="outline" size="icon md:default">
          <span className="hidden pr-1.5 md:block">YouTube</span>
          <ExternalLinkIcon size={16} />
        </Button>
      </a>
    );
  }

  return (
    <a href={feedItem.url} target="_blank" rel="noopener noreferrer">
      <Button variant="outline" size="icon md:default">
        <span className="hidden pr-1.5 md:block">
          {PLATFORM_TO_FORMATTED_NAME_MAP[feedItem.platform]}
        </span>
        <ExternalLinkIcon size={16} />
      </Button>
    </a>
  );
}

export function TopRightHeaderContent() {
  const { pathname } = useLocation();

  if (pathname.includes("/watch/") || pathname.includes("/read/")) {
    return (
      <div className="flex items-center gap-2">
        <OpenInYouTubeButton />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <RefetchItemsButton />
      <div className="lg:hidden">
        <OpenRightSidebarButton />
      </div>
    </div>
  );
}
