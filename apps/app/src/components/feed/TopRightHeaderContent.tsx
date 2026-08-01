"use client";

import { useLocation } from "@tanstack/react-router";
import { CopyIcon, ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";
import { ManageFeedsButton } from "./ManageFeedsButton";
import { OpenRightSidebarButton } from "./OpenRightSidebarButton";
import { RefetchItemsButton } from "./RefetchItemsButton";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { Button } from "~/components/ui/button";
import { SHORTCUT_KEYS } from "~/lib/constants/shortcuts";
import { PLATFORM_TO_FORMATTED_NAME_MAP } from "~/lib/data/feeds/utils";
import { useFeedItemValue } from "~/lib/data/store";
import { useBookmarkValue } from "~/lib/data/bookmarks";
import { useFeedItemActions } from "~/lib/hooks/useFeedItemActions";
import { useShortcut } from "~/lib/hooks/useShortcut";

function CopyUrlButton({ contentId }: { contentId: string }) {
  const { copyUrl } = useFeedItemActions(contentId);

  useShortcut(SHORTCUT_KEYS.COPY_URL, (event) => {
    event.preventDefault();
    void copyUrl();
  });

  return (
    <ButtonWithShortcut
      aria-label="Copy URL"
      variant="outline"
      shortcut={SHORTCUT_KEYS.COPY_URL}
      size="icon md:default"
      onClick={() => void copyUrl()}
    >
      <CopyIcon size={16} />
      <span className="hidden pl-1.5 md:block">Copy URL</span>
    </ButtonWithShortcut>
  );
}

function BookmarkHeaderActions({ bookmarkId }: { bookmarkId: string }) {
  const bookmark = useBookmarkValue(bookmarkId);

  const copyUrl = () => {
    if (!bookmark) return;
    void navigator.clipboard
      .writeText(bookmark.sourceUrl)
      .then(() => toast.success("Link copied"))
      .catch(() => toast.error("Could not copy URL"));
  };

  useShortcut(SHORTCUT_KEYS.COPY_URL, (event) => {
    event.preventDefault();
    copyUrl();
  });

  if (!bookmark) return null;

  return (
    <div className="flex items-center gap-2">
      <ButtonWithShortcut
        aria-label="Copy URL"
        variant="outline"
        shortcut={SHORTCUT_KEYS.COPY_URL}
        size="icon md:default"
        onClick={copyUrl}
      >
        <CopyIcon size={16} />
        <span className="hidden pl-1.5 md:block">Copy URL</span>
      </ButtonWithShortcut>
      <a
        href={bookmark.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open in Website"
      >
        <ButtonWithShortcut
          data-serial-reader-right-boundary
          variant="outline"
          shortcut={SHORTCUT_KEYS.OPEN_ORIGINAL}
          size="icon md:default"
        >
          <span className="hidden pr-1.5 md:block">Website</span>
          <ExternalLinkIcon size={16} />
        </ButtonWithShortcut>
      </a>
    </div>
  );
}

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
        <Button
          data-serial-reader-right-boundary
          variant="outline"
          size="icon md:default"
        >
          <span className="hidden pr-1.5 md:block">YouTube</span>
          <ExternalLinkIcon size={16} />
        </Button>
      </a>
    );
  }

  return (
    <a href={feedItem.url} target="_blank" rel="noopener noreferrer">
      <ButtonWithShortcut
        data-serial-reader-right-boundary
        variant="outline"
        shortcut={SHORTCUT_KEYS.OPEN_ORIGINAL}
        size="icon md:default"
      >
        <span className="hidden pr-1.5 md:block">
          {PLATFORM_TO_FORMATTED_NAME_MAP[feedItem.platform]}
        </span>
        <ExternalLinkIcon size={16} />
      </ButtonWithShortcut>
    </a>
  );
}

export function TopRightHeaderContent() {
  const { pathname } = useLocation();

  if (pathname.includes("/bookmark/")) {
    const bookmarkId = pathname.split("/bookmark/")[1]?.split("/")[0];
    return bookmarkId ? (
      <BookmarkHeaderActions bookmarkId={bookmarkId} />
    ) : null;
  }

  if (pathname.includes("/watch/") || pathname.includes("/read/")) {
    const contentId =
      pathname.split("/watch/")[1] ?? pathname.split("/read/")[1];

    return (
      <div className="flex items-center gap-2">
        {contentId && <CopyUrlButton contentId={contentId} />}
        <OpenInYouTubeButton />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <ManageFeedsButton />
      <RefetchItemsButton />
      <div className="lg:hidden">
        <OpenRightSidebarButton />
      </div>
    </div>
  );
}
