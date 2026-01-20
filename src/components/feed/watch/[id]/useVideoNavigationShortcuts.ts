import { useCallback } from "react";
import { useParams, useRouter } from "@tanstack/react-router";
import { useFilteredFeedItemsOrder } from "~/lib/data/feed-items";
import { useShortcut } from "~/lib/hooks/useShortcut";

export function useVideoNavigation() {
  const params = useParams({ from: "/_app/watch/$id" });
  const router = useRouter();

  const filteredFeedItemsOrder = useFilteredFeedItemsOrder();

  const videoID = params.id;

  const currentItemIndex = filteredFeedItemsOrder.indexOf(videoID);

  const canGoToPrevious = currentItemIndex > 0;
  const canGoToNext =
    currentItemIndex >= 0 &&
    currentItemIndex < filteredFeedItemsOrder.length - 1;

  const goToPreviousVideo = useCallback(() => {
    if (!filteredFeedItemsOrder.length) return;

    if (!videoID || currentItemIndex <= 0) {
      void router.navigate({ to: "/" });
      return;
    }

    const previousVideoId = filteredFeedItemsOrder[currentItemIndex - 1];

    if (!previousVideoId) {
      void router.navigate({ to: "/" });
      return;
    }

    void router.navigate({ to: `/watch/${previousVideoId}` });
  }, [filteredFeedItemsOrder, videoID, currentItemIndex, router]);

  const goToNextVideo = useCallback(() => {
    if (!filteredFeedItemsOrder.length) return;

    if (
      !videoID ||
      currentItemIndex < 0 ||
      currentItemIndex >= filteredFeedItemsOrder.length - 1
    ) {
      void router.navigate({ to: "/" });
      return;
    }

    const nextVideoId = filteredFeedItemsOrder[currentItemIndex + 1];

    if (!nextVideoId) {
      void router.navigate({ to: "/" });
      return;
    }

    void router.navigate({ to: `/watch/${nextVideoId}` });
  }, [filteredFeedItemsOrder, videoID, currentItemIndex, router]);

  return {
    goToPreviousVideo,
    goToNextVideo,
    canGoToPrevious,
    canGoToNext,
  };
}

export function useVideoNavigationShortcuts() {
  const { goToPreviousVideo, goToNextVideo } = useVideoNavigation();

  useShortcut("[", goToPreviousVideo);
  useShortcut("]", goToNextVideo);
}
