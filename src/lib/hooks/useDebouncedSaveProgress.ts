import { useCallback, useEffect, useRef } from "react";
import { useSetProgressMutation } from "~/lib/data/feed-items/mutations";
import { useFeedItemValue } from "~/lib/data/store";

const DEBOUNCE_MS = 500;

/**
 * Saves progress after 500ms of no mouse/trackpad scroll or keyboard input.
 */
export function useDebouncedSaveProgress({
  contentId,
  getProgress,
}: {
  contentId: string;
  getProgress: () => { progress: number; duration: number };
}) {
  const { mutate } = useSetProgressMutation(contentId);
  const feedItem = useFeedItemValue(contentId);

  const getProgressRef = useRef(getProgress);
  const feedItemRef = useRef(feedItem);
  const mutateRef = useRef(mutate);

  useEffect(() => {
    getProgressRef.current = getProgress;
    feedItemRef.current = feedItem;
    mutateRef.current = mutate;
  });

  const save = useCallback(() => {
    const item = feedItemRef.current;
    if (!item) return;
    const { progress, duration } = getProgressRef.current();
    if (progress >= 0 && duration > 0) {
      mutateRef.current({
        id: item.id,
        feedId: item.feedId,
        progress,
        duration,
      });
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, DEBOUNCE_MS);
    };

    window.addEventListener("wheel", resetTimer);
    window.addEventListener("keydown", resetTimer);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("wheel", resetTimer);
      window.removeEventListener("keydown", resetTimer);
    };
  }, [save]);
}
