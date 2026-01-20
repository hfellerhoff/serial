"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseInfiniteScrollOptions {
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  threshold?: number; // 0-1, how much of the sentinel should be visible
  rootMargin?: string; // e.g., "100px" to trigger before element is visible
}

/**
 * Hook for infinite scroll using IntersectionObserver.
 * Returns a ref to attach to a sentinel element that triggers loading more items.
 *
 * @example
 * ```tsx
 * const { sentinelRef } = useInfiniteScroll({
 *   onLoadMore: () => fetchMoreItems(),
 *   hasMore: paginationState?.hasMore ?? false,
 *   isLoading: paginationState?.isFetching ?? false,
 * });
 *
 * return (
 *   <div>
 *     {items.map(item => <Item key={item.id} />)}
 *     <div ref={sentinelRef} /> // Triggers load when visible
 *   </div>
 * );
 * ```
 */
export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  isLoading,
  threshold = 0,
  rootMargin = "200px",
}: UseInfiniteScrollOptions) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [sentinelElement, setSentinelElement] = useState<HTMLDivElement | null>(
    null,
  );

  // Use refs for values that change frequently to avoid recreating the observer
  const onLoadMoreRef = useRef(onLoadMore);
  const hasMoreRef = useRef(hasMore);
  const isLoadingRef = useRef(isLoading);

  // Update refs when values change
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // Callback ref to track when sentinel element changes
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    setSentinelElement(node);
  }, []);

  useEffect(() => {
    if (!sentinelElement) return;

    // Disconnect existing observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    // Create observer with stable callback that reads from refs
    observerRef.current = new IntersectionObserver(
      (entries: IntersectionObserverEntry[]) => {
        const [entry] = entries;
        if (
          entry?.isIntersecting &&
          hasMoreRef.current &&
          !isLoadingRef.current
        ) {
          onLoadMoreRef.current();
        }
      },
      {
        threshold,
        rootMargin,
      },
    );

    observerRef.current.observe(sentinelElement);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [sentinelElement, threshold, rootMargin]);

  return { sentinelRef };
}
