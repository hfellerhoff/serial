"use client";

import { useLocation } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import type { FeedPlatform } from "~/server/db/schema";
import { articleZoomAtom, videoZoomAtom } from "~/lib/data/atoms";
import { useFeedItemValue } from "~/lib/data/store";

export const MIN_ZOOM = 0;
export const MAX_ZOOM = 6;

const VIDEO_PLATFORMS: FeedPlatform[] = ["youtube", "peertube"];
const ARTICLE_PLATFORMS: FeedPlatform[] = ["website"];

export function useZoom() {
  const { pathname } = useLocation();
  const videoId = pathname.split("/watch/")[1]!;
  const contentId = pathname.split("/read/")[1]!;

  const [zoom, setZoom] = useState(MIN_ZOOM);

  const feedItem = useFeedItemValue(videoId || contentId || "");

  const platform = feedItem?.platform ?? "";

  const [videoZoom, setVideoZoom] = useAtom(videoZoomAtom);
  const [articleZoom, setArticleZoom] = useAtom(articleZoomAtom);

  const isVideoPlatform = VIDEO_PLATFORMS.includes(platform);
  const isArticlePlatform = ARTICLE_PLATFORMS.includes(platform);

  useEffect(() => {
    setZoom((prevZoom) => {
      if (isVideoPlatform) {
        return videoZoom;
      }
      if (isArticlePlatform) {
        return articleZoom;
      }

      // This value should default to MIN_ZOOM, but when naviating
      // this value is used by the UI before the new UI has rendered.
      // Therefore, we want to maintain the previously applied value
      return prevZoom;
    });
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
