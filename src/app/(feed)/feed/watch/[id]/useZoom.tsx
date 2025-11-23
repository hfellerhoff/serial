"use client";

import { useAtom } from "jotai";
import { usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import { articleZoomAtom, videoZoomAtom } from "~/lib/data/atoms";
import { useFeedItemValue } from "~/lib/data/store";
import type { FeedPlatform } from "~/server/db/schema";

export const MIN_ZOOM = 0;
export const MAX_ZOOM = 6;

const VIDEO_PLATFORMS: FeedPlatform[] = ["youtube", "peertube"];
const ARTICLE_PLATFORMS: FeedPlatform[] = ["website"];

export function useZoom() {
  const pathname = usePathname();
  const videoId = pathname.split("/feed/watch/")[1]!;
  const contentId = pathname.split("/feed/read/")[1]!;

  const feedItem = useFeedItemValue(videoId || contentId || "");

  const platform = feedItem?.platform ?? "";

  const [videoZoom, setVideoZoom] = useAtom(videoZoomAtom);
  const [articleZoom, setArticleZoom] = useAtom(articleZoomAtom);

  const isVideoPlatform = VIDEO_PLATFORMS.includes(platform);
  const isArticlePlatform = ARTICLE_PLATFORMS.includes(platform);

  const zoom = useMemo(() => {
    if (isVideoPlatform) {
      return videoZoom;
    }
    if (isArticlePlatform) {
      return articleZoom;
    }
    return 0;
  }, [isVideoPlatform, videoZoom, isArticlePlatform, articleZoom]);

  const zoomIn = useCallback(() => {
    if (isVideoPlatform) {
      setVideoZoom((z) => {
        if (z >= MAX_ZOOM) {
          return z;
        }
        return z + 1;
      });
    }
    if (isArticlePlatform) {
      setArticleZoom((z) => {
        if (z >= MAX_ZOOM) {
          return z;
        }
        return z + 1;
      });
    }
    return () => {};
  }, [isVideoPlatform, setVideoZoom, isArticlePlatform, setArticleZoom]);

  const zoomOut = useCallback(() => {
    if (isVideoPlatform) {
      setVideoZoom((z) => {
        if (z <= MIN_ZOOM) {
          return z;
        }
        return z - 1;
      });
    }
    if (isArticlePlatform) {
      setArticleZoom((z) => {
        if (z <= MIN_ZOOM) {
          return z;
        }
        return z - 1;
      });
    }
    return () => {};
  }, [isVideoPlatform, setVideoZoom, isArticlePlatform, setArticleZoom]);

  return {
    zoom,
    zoomIn,
    zoomOut,
  };
}
