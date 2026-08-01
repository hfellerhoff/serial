"use client";

import { createFileRoute } from "@tanstack/react-router";
import clsx from "clsx";
import { useEffect } from "react";
import { useView } from "~/components/feed/watch/[id]/useView";
import { useZoom } from "~/components/feed/watch/[id]/useZoom";
import { VideoDisplay } from "~/components/feed/watch/[id]/VideoDisplay";
import useIsInactive from "~/lib/hooks/useIsInactive";
import { useFeedItemValue } from "~/lib/data/store";
import { useOpenOriginalShortcut } from "~/lib/hooks/useOpenOriginalShortcut";
import { useRefreshFeedItem } from "~/lib/hooks/useRefreshFeedItem";
import { useRetentionPin } from "~/lib/hooks/useRetentionPin";
import { useBookmarkValue } from "~/lib/data/bookmarks";
import { BookmarkVideoDisplay } from "~/components/content-player/BookmarkVideoDisplay";
import { ContentRendererFallback } from "~/components/content-renderer/ContentRendererFallback";
import {
  contentDestination,
  resolveContentItem,
} from "~/lib/data/content-items/resolver";

export const Route = createFileRoute("/_app/watch/$id")({
  component: WatchVideoPage,
});

function WatchVideoPage() {
  const params = Route.useParams();
  const bookmark = useBookmarkValue(params.id);
  const feedItem = useFeedItemValue(params.id);
  useRefreshFeedItem(bookmark ? undefined : params.id);
  const resolution = resolveContentItem({ bookmark, feedItem });
  if (resolution.status === "ambiguous") {
    return <p className="p-6 text-center">This content ID is ambiguous.</p>;
  }
  if (resolution.status === "missing") {
    return <p className="p-6 text-center">Loading content…</p>;
  }
  const destination = contentDestination(resolution.item);
  if (destination.renderer !== "watch") {
    return <ContentRendererFallback destination={destination} />;
  }
  return (
    <VideoPage
      id={params.id}
      bookmark={
        resolution.item.entityKind === "bookmark"
          ? resolution.item.entity
          : undefined
      }
    />
  );
}

function VideoPage({
  id,
  bookmark,
}: {
  id: string;
  bookmark?: NonNullable<ReturnType<typeof useBookmarkValue>>;
}) {
  useRetentionPin(bookmark ? "bookmark" : "feed-item", id);

  const { view } = useView();
  const { zoom, isVertical } = useZoom();

  const isInactive = useIsInactive();
  const feedItem = useFeedItemValue(id);

  useEffect(() => {
    if (isInactive) {
      document.body.classList.add("no-cursor");
    } else {
      document.body.classList.remove("no-cursor");
    }

    return () => {
      document.body.classList.remove("no-cursor");
    };
  }, [isInactive]);

  // Shortcut to open original URL
  useOpenOriginalShortcut(bookmark?.sourceUrl ?? feedItem?.url);

  const isWindowedVertical = view === "windowed" && isVertical;
  const isWindowedHorizontal = view === "windowed" && !isVertical;

  return (
    <div
      className={clsx("mx-auto grid h-full w-full place-items-center", {
        "bg-background absolute inset-0 z-30": view === "fullscreen",
        "max-w-xl":
          (isWindowedHorizontal && zoom === 0) ||
          (isWindowedVertical && zoom === 3),
        "max-w-2xl": isWindowedHorizontal && zoom === 1,
        "max-w-3xl": isWindowedHorizontal && zoom === 2,
        "max-w-4xl": isWindowedHorizontal && zoom === 3,
        "max-w-5xl": isWindowedHorizontal && zoom === 4,
        "max-w-6xl": isWindowedHorizontal && zoom === 5,
        "max-w-7xl": isWindowedHorizontal && zoom === 6,
        "max-w-sm": isWindowedVertical && zoom === 0,
        "max-w-md": isWindowedVertical && zoom === 1,
        "max-w-lg": isWindowedVertical && zoom === 2,
      })}
    >
      <div
        className={clsx("h-full w-full", {
          "sm:py-6": view === "windowed",
        })}
      >
        {bookmark ? (
          <BookmarkVideoDisplay bookmark={bookmark} isInactive={isInactive} />
        ) : (
          <VideoDisplay id={id} isInactive={isInactive} />
        )}
      </div>
    </div>
  );
}
