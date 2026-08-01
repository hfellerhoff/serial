"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import ResponsiveVideo from "~/components/ResponsiveVideo";
import { BookmarkReaderActions } from "~/components/bookmarks/BookmarkReaderActions";
import { useView } from "~/components/feed/watch/[id]/useView";

export function BookmarkVideoDisplay({
  bookmark,
  isInactive,
}: {
  bookmark: ApplicationBookmark;
  isInactive: boolean;
}) {
  const [showVideo, setShowVideo] = useState(false);
  const { view } = useView();

  useEffect(() => {
    const timeout = setTimeout(() => setShowVideo(true), 100);
    return () => clearTimeout(timeout);
  }, []);

  if (!bookmark.contentId) return null;
  const isVertical = bookmark.orientation === "vertical";
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
            "relative w-full overflow-hidden transition-opacity",
            {
              "aspect-9/16 rounded": view === "windowed" && isVertical,
              "aspect-video rounded": view === "windowed" && !isVertical,
              "h-full": view === "fullscreen",
              "opacity-0": !showVideo,
              "opacity-100": showVideo,
            },
          )}
        >
          <ResponsiveVideo
            videoID={bookmark.contentId}
            bookmarkId={bookmark.id}
            platform={bookmark.platform}
            orientation={bookmark.orientation}
            originalUrl={bookmark.sourceUrl}
            isInactive={isInactive}
          />
        </div>
      </div>
      <BookmarkReaderActions bookmarkId={bookmark.id} />
    </>
  );
}
