"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useLocation } from "@tanstack/react-router";
import { useShortcut } from "./useShortcut";
import { useFeedItemActions } from "./useFeedItemActions";
import { useLoadMoreItems } from "./useLoadMoreItems";
import type { KeyboardEvent } from "react";
import {
  categoryFilterAtom,
  feedFilterAtom,
  isReturningFromRouteAtom,
  selectedItemIdAtom,
  softReadItemIdsAtom,
  viewFilterIdAtom,
} from "~/lib/data/atoms";
import {
  getShortcutAllowRepeat,
  getShortcutKey,
  SHORTCUT_KEYS,
} from "~/lib/constants/shortcuts";
import {
  useSaveToInstapaperMutation,
  useShowInstapaperAction,
} from "~/lib/data/instapaper";

const SCROLL_DURATION_MS = 300;
const TARGET_VIEWPORT_POSITION = 1 / 3;

function isElementInViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.top < window.innerHeight && rect.bottom > 0;
}

function getClosestVisibleItem(items: string[]): string | null {
  const viewportTarget = window.innerHeight * TARGET_VIEWPORT_POSITION;
  let closestItem: string | null = null;
  let closestDistance = Infinity;

  for (const itemId of items) {
    const element = document.querySelector(`[data-item-id="${itemId}"]`);
    if (!element) continue;

    const rect = element.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

    const elementCenter = rect.top + rect.height / 2;
    const distance = Math.abs(elementCenter - viewportTarget);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestItem = itemId;
    }
  }

  return closestItem;
}

function getGridColumns(items: string[]): number {
  if (items.length < 2) return 1;

  const firstElement = document.querySelector(`[data-item-id="${items[0]}"]`);
  if (!firstElement) return 1;

  const firstRect = firstElement.getBoundingClientRect();
  const firstTop = Math.round(firstRect.top);

  for (let i = 1; i < items.length; i++) {
    const element = document.querySelector(`[data-item-id="${items[i]}"]`);
    if (!element) continue;

    const rect = element.getBoundingClientRect();
    if (Math.round(rect.top) !== firstTop) {
      return i;
    }
  }

  return items.length;
}

function getGridPosition(
  items: string[],
  selectedItemId: string,
): { row: number; col: number; columns: number } | null {
  const index = items.indexOf(selectedItemId);
  if (index === -1) return null;

  const columns = getGridColumns(items);
  const row = Math.floor(index / columns);
  const col = index % columns;

  return { row, col, columns };
}

export function useFeedItemNavigation(
  items: string[],
  isGridLayout: boolean = false,
) {
  const [selectedItemId, setSelectedItemId] = useAtom(selectedItemIdAtom);
  const setSoftReadItemIds = useSetAtom(softReadItemIdsAtom);
  const [isReturningFromRoute, setIsReturningFromRoute] = useAtom(
    isReturningFromRouteAtom,
  );
  const viewFilterId = useAtomValue(viewFilterIdAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const feedFilter = useAtomValue(feedFilterAtom);
  const { pathname } = useLocation();

  const prevViewFilterIdRef = useRef<number | null>(null);
  const prevCategoryFilterRef = useRef<number | null>(null);
  const prevFeedFilterRef = useRef<number | null>(null);
  const keyboardNavActiveRef = useRef(false);
  const lastNavTimeRef = useRef<number>(0);

  const selectedItemActions = useFeedItemActions(selectedItemId ?? "");
  const showInstapaperAction = useShowInstapaperAction(selectedItemId ?? "");
  const { mutateAsync: saveToInstapaper } = useSaveToInstapaperMutation(
    selectedItemId ?? "",
  );
  const { handleLoadMore } = useLoadMoreItems();

  const scrollToItem = useCallback(
    (itemId: string | null, forceInstant: boolean = false) => {
      if (!itemId) return;
      const element = document.querySelector(`[data-item-id="${itemId}"]`);
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const targetPosition = window.innerHeight * TARGET_VIEWPORT_POSITION;
      const scrollTop =
        window.scrollY + rect.top - targetPosition + rect.height / 2;

      const now = performance.now();
      const isRapid = now - lastNavTimeRef.current < SCROLL_DURATION_MS;
      lastNavTimeRef.current = now;

      if (forceInstant || isRapid) {
        window.scrollTo({ top: scrollTop, behavior: "instant" });
        return;
      }

      window.scrollTo({ top: scrollTop, behavior: "smooth" });
    },
    [],
  );

  const selectItem = useCallback(
    (itemId: string | null, forceInstant: boolean = false) => {
      keyboardNavActiveRef.current = true;
      setSelectedItemId(itemId);
      scrollToItem(itemId, forceInstant);
    },
    [setSelectedItemId, scrollToItem],
  );

  const selectNextItem = useCallback(
    (currentIndex: number) => {
      const nextIndex = currentIndex + 1;
      if (nextIndex < items.length) {
        selectItem(items[nextIndex]!);
      } else if (currentIndex > 0) {
        selectItem(items[currentIndex - 1]!);
      } else {
        selectItem(null);
      }
    },
    [items, selectItem],
  );

  const handleArrowDown = useCallback(
    (event: KeyboardEvent) => {
      event.preventDefault();
      if (pathname !== "/") return;

      const currentIndex = selectedItemId ? items.indexOf(selectedItemId) : -1;

      if (currentIndex === -1) {
        if (window.scrollY === 0 && items.length > 0) {
          selectItem(items[0]!);
        } else {
          const closestItem = getClosestVisibleItem(items);
          if (closestItem) {
            selectItem(closestItem);
          } else if (items.length > 0) {
            selectItem(items[0]!);
          }
        }
        return;
      }

      const selectedElement = document.querySelector(
        `[data-item-id="${selectedItemId}"]`,
      );
      if (selectedElement && !isElementInViewport(selectedElement)) {
        const closestItem = getClosestVisibleItem(items);
        if (closestItem) {
          selectItem(closestItem);
        }
        return;
      }

      if (isGridLayout && selectedItemId) {
        const gridPos = getGridPosition(items, selectedItemId);
        if (gridPos) {
          const nextIndex = (gridPos.row + 1) * gridPos.columns + gridPos.col;
          if (nextIndex < items.length) {
            selectItem(items[nextIndex]!);
          } else {
            setSelectedItemId(null);
            window.scrollTo({ top: 0, behavior: "instant" });
          }
        }
      } else {
        const nextIndex = currentIndex + 1;
        if (nextIndex >= items.length) {
          setSelectedItemId(null);
          window.scrollTo({ top: 0, behavior: "instant" });
        } else {
          selectItem(items[nextIndex]!);
        }
      }
    },
    [
      pathname,
      selectedItemId,
      items,
      selectItem,
      isGridLayout,
      setSelectedItemId,
    ],
  );

  const handleArrowUp = useCallback(
    (event: KeyboardEvent) => {
      event.preventDefault();
      if (pathname !== "/") return;

      const currentIndex = selectedItemId ? items.indexOf(selectedItemId) : -1;

      if (currentIndex === -1) {
        if (window.scrollY === 0 && items.length > 0) {
          selectItem(items[items.length - 1]!, true);
          handleLoadMore();
        } else {
          const closestItem = getClosestVisibleItem(items);
          if (closestItem) {
            selectItem(closestItem);
          } else if (items.length > 0) {
            selectItem(items[items.length - 1]!, true);
          }
        }
        return;
      }

      const selectedElement = document.querySelector(
        `[data-item-id="${selectedItemId}"]`,
      );
      if (selectedElement && !isElementInViewport(selectedElement)) {
        const closestItem = getClosestVisibleItem(items);
        if (closestItem) {
          selectItem(closestItem);
        }
        return;
      }

      if (isGridLayout && selectedItemId) {
        const gridPos = getGridPosition(items, selectedItemId);
        if (gridPos && gridPos.row > 0) {
          const prevIndex = (gridPos.row - 1) * gridPos.columns + gridPos.col;
          selectItem(items[prevIndex]!);
        } else {
          setSelectedItemId(null);
          window.scrollTo({ top: 0, behavior: "instant" });
        }
      } else if (currentIndex > 0) {
        selectItem(items[currentIndex - 1]!);
      } else {
        setSelectedItemId(null);
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    },
    [
      pathname,
      selectedItemId,
      items,
      selectItem,
      isGridLayout,
      setSelectedItemId,
      handleLoadMore,
    ],
  );

  const handleArrowRight = useCallback(
    (event: KeyboardEvent) => {
      event.preventDefault();
      if (pathname !== "/" || !isGridLayout) return;

      const currentIndex = selectedItemId ? items.indexOf(selectedItemId) : -1;
      if (currentIndex === -1) {
        if (items.length > 0) selectItem(items[0]!);
        return;
      }

      const nextIndex = currentIndex + 1;
      if (nextIndex < items.length) {
        selectItem(items[nextIndex]!);
      }
    },
    [pathname, selectedItemId, items, selectItem, isGridLayout],
  );

  const handleArrowLeft = useCallback(
    (event: KeyboardEvent) => {
      event.preventDefault();
      if (pathname !== "/" || !isGridLayout) return;

      const currentIndex = selectedItemId ? items.indexOf(selectedItemId) : -1;
      if (currentIndex === -1) {
        if (items.length > 0) selectItem(items[0]!);
        return;
      }

      if (currentIndex > 0) {
        selectItem(items[currentIndex - 1]!);
      }
    },
    [pathname, selectedItemId, items, selectItem, isGridLayout],
  );

  useShortcut(getShortcutKey(SHORTCUT_KEYS.ARROW_DOWN), handleArrowDown, {
    allowRepeat: getShortcutAllowRepeat(SHORTCUT_KEYS.ARROW_DOWN),
  });

  useShortcut(getShortcutKey(SHORTCUT_KEYS.ARROW_UP), handleArrowUp, {
    allowRepeat: getShortcutAllowRepeat(SHORTCUT_KEYS.ARROW_UP),
  });

  useShortcut(getShortcutKey(SHORTCUT_KEYS.ARROW_RIGHT), handleArrowRight, {
    allowRepeat: getShortcutAllowRepeat(SHORTCUT_KEYS.ARROW_RIGHT),
  });

  useShortcut(getShortcutKey(SHORTCUT_KEYS.ARROW_LEFT), handleArrowLeft, {
    allowRepeat: getShortcutAllowRepeat(SHORTCUT_KEYS.ARROW_LEFT),
  });

  const handleToggleRead = useCallback(
    (event: KeyboardEvent) => {
      event.preventDefault();
      if (pathname !== "/" || !selectedItemId) return;

      const idx = items.indexOf(selectedItemId);
      const wasMarkedRead = selectedItemActions.toggleRead();
      if (wasMarkedRead) {
        if (idx === items.length - 1) {
          setSelectedItemId(null);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          selectNextItem(idx);
        }
      }
    },
    [
      pathname,
      selectedItemId,
      selectedItemActions,
      items,
      selectNextItem,
      setSelectedItemId,
    ],
  );

  useShortcut(getShortcutKey(SHORTCUT_KEYS.TOGGLE_READ), handleToggleRead);

  useShortcut(getShortcutKey(SHORTCUT_KEYS.TOGGLE_READ_ALT), handleToggleRead);

  useShortcut(getShortcutKey(SHORTCUT_KEYS.TOGGLE_LATER), () => {
    if (pathname !== "/" || !selectedItemId) return;

    selectedItemActions.toggleWatchLater();
    const idx = items.indexOf(selectedItemId);
    selectNextItem(idx);
  });

  useShortcut(getShortcutKey(SHORTCUT_KEYS.ENTER), () => {
    if (pathname !== "/" || !selectedItemId) return;

    selectedItemActions.openItem();
  });

  useShortcut(getShortcutKey(SHORTCUT_KEYS.SEND_TO_INSTAPAPER), () => {
    if (pathname !== "/" || !selectedItemId || !showInstapaperAction) return;

    void saveToInstapaper({ feedItemId: selectedItemId });
    const idx = items.indexOf(selectedItemId);
    selectNextItem(idx);
  });

  useEffect(() => {
    if (viewFilterId === null) return;

    const viewChanged =
      prevViewFilterIdRef.current !== null &&
      prevViewFilterIdRef.current !== viewFilterId;
    const categoryChanged =
      prevCategoryFilterRef.current !== null &&
      prevCategoryFilterRef.current !== categoryFilter;
    const feedChanged =
      prevFeedFilterRef.current !== null &&
      prevFeedFilterRef.current !== feedFilter;

    if (viewChanged || categoryChanged || feedChanged) {
      setSoftReadItemIds(new Set());
      setSelectedItemId(null);
      window.scrollTo({ top: 0, behavior: "instant" });
    }

    prevViewFilterIdRef.current = viewFilterId;
    prevCategoryFilterRef.current = categoryFilter;
    prevFeedFilterRef.current = feedFilter;
  }, [
    viewFilterId,
    categoryFilter,
    feedFilter,
    setSoftReadItemIds,
    setSelectedItemId,
  ]);

  useEffect(() => {
    if (pathname !== "/") {
      setIsReturningFromRoute(true);
      return;
    }

    if (isReturningFromRoute && selectedItemId) {
      setIsReturningFromRoute(false);
      scrollToItem(selectedItemId, true);
    }
  }, [
    pathname,
    selectedItemId,
    isReturningFromRoute,
    setIsReturningFromRoute,
    scrollToItem,
  ]);

  useEffect(() => {
    const handleMouseMove = () => {
      keyboardNavActiveRef.current = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const handleMouseSelect = useCallback(
    (itemId: string) => {
      if (keyboardNavActiveRef.current) return;
      setSelectedItemId(itemId);
    },
    [setSelectedItemId],
  );

  return { selectedItemId, handleMouseSelect };
}
