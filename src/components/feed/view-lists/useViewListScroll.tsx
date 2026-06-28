import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteScroll } from "~/lib/hooks/useInfiniteScroll";
import { useItemWindow } from "~/lib/hooks/useItemWindow";
import { useLoadMoreItems } from "~/lib/hooks/useLoadMoreItems";
import { updateCurrentHomeRenderedItemCount } from "~/lib/scroll";

type PendingServerExpansion = {
  id: number;
  isComplete: boolean;
};

export function useViewListScroll(itemIds: string[]) {
  const { handleLoadMore, paginationKey, paginationState } = useLoadMoreItems();
  const nextServerLoadIdRef = useRef(0);
  const handledServerExpansionIdRef = useRef<number | null>(null);
  const [pendingServerExpansion, setPendingServerExpansion] =
    useState<PendingServerExpansion | null>(null);
  const [scrolledListKey, setScrolledListKey] = useState<string | null>(null);
  const firstItemId = itemIds[0];
  const currentListKey = `${paginationKey}:${firstItemId ?? "empty"}`;
  const { visibleItems, expandWindow, renderCount } = useItemWindow(
    itemIds,
    currentListKey,
  );
  const hasUserScrolledCurrentList = scrolledListKey === currentListKey;

  useEffect(() => {
    updateCurrentHomeRenderedItemCount(currentListKey, renderCount);
  }, [currentListKey, renderCount]);

  useEffect(() => {
    const scrollContainer = document.querySelector(
      '[data-slot="sidebar-inset"]',
    );
    const scrollTarget = scrollContainer ?? window;

    const markCurrentListScrolled = () => {
      if (hasUserScrolledCurrentList) return;

      setScrolledListKey(currentListKey);
    };

    scrollTarget.addEventListener("scroll", markCurrentListScrolled, {
      passive: true,
    });

    return () => {
      scrollTarget.removeEventListener("scroll", markCurrentListScrolled);
    };
  }, [currentListKey, hasUserScrolledCurrentList]);

  const loadMoreFromServer = useCallback(() => {
    const serverLoadId = nextServerLoadIdRef.current + 1;
    nextServerLoadIdRef.current = serverLoadId;

    setPendingServerExpansion({
      id: serverLoadId,
      isComplete: false,
    });

    void handleLoadMore().finally(() => {
      setPendingServerExpansion((pendingExpansion) => {
        if (pendingExpansion?.id !== serverLoadId) {
          return pendingExpansion;
        }

        return { ...pendingExpansion, isComplete: true };
      });
    });
  }, [handleLoadMore]);

  const handleLoadMoreWithCache = useCallback(() => {
    if (renderCount < itemIds.length) {
      // More cached items available — expand window without server fetch
      expandWindow(itemIds.length);
    } else {
      // Exhausted cached items — fetch from server
      loadMoreFromServer();
    }
  }, [renderCount, itemIds.length, expandWindow, loadMoreFromServer]);

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: handleLoadMoreWithCache,
    hasMore:
      hasUserScrolledCurrentList &&
      (renderCount < itemIds.length || (paginationState?.hasMore ?? false)),
    isLoading: paginationState?.isFetching ?? false,
    rootMargin: "0px",
  });

  useEffect(() => {
    if (!pendingServerExpansion?.isComplete) return;
    if (handledServerExpansionIdRef.current === pendingServerExpansion.id) {
      return;
    }
    if (paginationState?.isFetching === true) return;

    handledServerExpansionIdRef.current = pendingServerExpansion.id;
    expandWindow(itemIds.length);
  }, [expandWindow, itemIds.length, paginationState, pendingServerExpansion]);

  return {
    sentinelRef,
    paginationState,
    visibleItems,
    hasRenderedAllItems: renderCount >= itemIds.length,
  };
}
