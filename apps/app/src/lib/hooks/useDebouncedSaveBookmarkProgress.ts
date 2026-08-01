"use client";

import { useCallback, useEffect, useRef } from "react";
import { getShortcutKeys, SHORTCUT_KEYS } from "~/lib/constants/shortcuts";
import { useBookmarkValue } from "~/lib/data/bookmarks";
import { useUpdateBookmarkStateMutation } from "~/lib/data/bookmarks/mutations";

const NAV_KEYS = new Set([
  ...getShortcutKeys(SHORTCUT_KEYS.ARROW_UP),
  ...getShortcutKeys(SHORTCUT_KEYS.ARROW_DOWN),
]);
const DEBOUNCE_MS = 500;

export function useDebouncedSaveBookmarkProgress({
  bookmarkId,
  getProgress,
}: {
  bookmarkId: string;
  getProgress: () => { progress: number; duration: number };
}) {
  const bookmark = useBookmarkValue(bookmarkId);
  const { mutate } = useUpdateBookmarkStateMutation(bookmarkId);
  const getProgressRef = useRef(getProgress);
  const bookmarkRef = useRef(bookmark);
  const mutateRef = useRef(mutate);

  useEffect(() => {
    getProgressRef.current = getProgress;
    bookmarkRef.current = bookmark;
    mutateRef.current = mutate;
  });

  const save = useCallback(() => {
    if (!bookmarkRef.current) return;
    const { progress, duration } = getProgressRef.current();
    if (progress < 0 || duration <= 0) return;
    mutateRef.current({ bookmarkId, progress, duration });
  }, [bookmarkId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, DEBOUNCE_MS);
    };
    const onKeydown = (event: KeyboardEvent) => {
      if (NAV_KEYS.has(event.key)) resetTimer();
    };
    window.addEventListener("wheel", resetTimer, { passive: true });
    window.addEventListener("keydown", onKeydown);
    return () => {
      if (timer) clearTimeout(timer);
      save();
      window.removeEventListener("wheel", resetTimer);
      window.removeEventListener("keydown", onKeydown);
    };
  }, [save]);
}
