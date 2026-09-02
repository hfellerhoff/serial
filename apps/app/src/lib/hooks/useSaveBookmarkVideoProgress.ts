"use client";

import { useCallback, useEffect, useRef } from "react";
import { useBookmarkValue } from "~/lib/data/bookmarks";
import { useUpdateBookmarkStateMutation } from "~/lib/data/bookmarks/mutations";
import { canMutateNow } from "~/lib/data/offline-mutations";

const SAVE_INTERVAL_MS = 30_000;

export function useSaveBookmarkVideoProgress(input: {
  bookmarkId: string;
  getProgress: () => { progress: number; duration: number };
  enabled: boolean;
}) {
  const bookmark = useBookmarkValue(input.bookmarkId);
  const { mutate } = useUpdateBookmarkStateMutation(input.bookmarkId);
  const bookmarkRef = useRef(bookmark);
  const getProgressRef = useRef(input.getProgress);
  const mutateRef = useRef(mutate);

  useEffect(() => {
    bookmarkRef.current = bookmark;
    getProgressRef.current = input.getProgress;
    mutateRef.current = mutate;
  });

  const save = useCallback(() => {
    if (!bookmarkRef.current) return;
    if (!canMutateNow()) return;
    const progress = getProgressRef.current();
    if (progress.progress < 0 || progress.duration <= 0) return;
    mutateRef.current({
      bookmarkId: input.bookmarkId,
      progress: progress.progress,
      duration: progress.duration,
    });
  }, [input.bookmarkId]);

  useEffect(() => {
    if (!input.enabled) return;
    const interval = setInterval(save, SAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [input.enabled, save]);

  useEffect(() => () => save(), [save]);
  return { saveNow: save };
}
