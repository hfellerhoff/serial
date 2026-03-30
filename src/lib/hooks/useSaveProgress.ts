import { useCallback, useEffect, useRef } from "react";
import { useSetProgressMutation } from "~/lib/data/feed-items/mutations";
import { useFeedItemValue } from "~/lib/data/store";

const SAVE_INTERVAL_MS = 30_000;

export function useSaveProgress({
  contentId,
  getProgress,
  enabled,
}: {
  contentId: string;
  getProgress: () => { progress: number; duration: number };
  enabled: boolean;
}) {
  const { mutate } = useSetProgressMutation(contentId);
  const feedItem = useFeedItemValue(contentId);

  // Use refs to avoid stale closures in interval/cleanup callbacks
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

  // 30-second interval when enabled
  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(save, SAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, save]);

  // Save on unmount (covers navigation away)
  useEffect(() => {
    return () => {
      save();
    };
  }, [save]);

  return { saveNow: save };
}
