"use client";

import { useLocation } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import type { FeedPlatform } from "~/server/db/schema";
import {
  articleZoomAtom,
  longformVideoZoomAtom,
  shortformVideoZoomAtom,
} from "~/lib/data/atoms";
import { useFeedItemValue } from "~/lib/data/store";

export const MIN_ZOOM = 0;
export const MAX_ZOOM = 6;

export const MIN_ZOOM_VERTICAL = 0;
export const MAX_ZOOM_VERTICAL = 3;

const VIDEO_PLATFORMS: FeedPlatform[] = ["youtube", "peertube"];
const ARTICLE_PLATFORMS: FeedPlatform[] = ["website"];

export function useZoom() {
  const { pathname } = useLocation();
  const videoId = pathname.split("/watch/")[1]!;
  const contentId = pathname.split("/read/")[1]!;

  const [zoom, setZoom] = useState(MIN_ZOOM);

  const feedItem = useFeedItemValue(videoId || contentId || "");

  const platform = feedItem?.platform ?? "";
  const isVertical = feedItem?.orientation === "vertical";

  const minZoom = isVertical ? MIN_ZOOM_VERTICAL : MIN_ZOOM;
  const maxZoom = isVertical ? MAX_ZOOM_VERTICAL : MAX_ZOOM;

  const [longformVideoZoom, setLongformVideoZoom] = useAtom(
    longformVideoZoomAtom,
  );
  const [shortformVideoZoom, setShortformVideoZoom] = useAtom(
    shortformVideoZoomAtom,
  );
  const [articleZoom, setArticleZoom] = useAtom(articleZoomAtom);

  const isVideoPlatform = VIDEO_PLATFORMS.includes(platform);
  const isArticlePlatform = ARTICLE_PLATFORMS.includes(platform);

  useEffect(() => {
    setZoom((prevZoom) => {
      if (isVideoPlatform && isVertical) {
        return shortformVideoZoom;
      }
      if (isVideoPlatform && !isVertical) {
        return longformVideoZoom;
      }
      if (isArticlePlatform) {
        return articleZoom;
      }

      // This value should default to MIN_ZOOM, but when naviating
      // this value is used by the UI before the new UI has rendered.
      // Therefore, we want to maintain the previously applied value
      return prevZoom;
    });
  }, [
    isVideoPlatform,
    longformVideoZoom,
    shortformVideoZoom,
    isVertical,
    isArticlePlatform,
    articleZoom,
  ]);

  const zoomIn = useCallback(() => {
    if (isVideoPlatform) {
      const setVideoZoom = isVertical
        ? setShortformVideoZoom
        : setLongformVideoZoom;
      setVideoZoom((z) => {
        if (z >= maxZoom) {
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
  }, [
    isVideoPlatform,
    isVertical,
    setShortformVideoZoom,
    setLongformVideoZoom,
    maxZoom,
    isArticlePlatform,
    setArticleZoom,
  ]);

  const zoomOut = useCallback(() => {
    if (isVideoPlatform) {
      const setVideoZoom = isVertical
        ? setShortformVideoZoom
        : setLongformVideoZoom;
      setVideoZoom((z) => {
        if (z <= minZoom) {
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
  }, [
    isVideoPlatform,
    isVertical,
    setShortformVideoZoom,
    setLongformVideoZoom,
    minZoom,
    isArticlePlatform,
    setArticleZoom,
  ]);

  return {
    zoom,
    zoomIn,
    zoomOut,
    isVertical,
    minZoom,
    maxZoom,
  };
}
