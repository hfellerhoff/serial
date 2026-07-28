"use client";

import { useCallback, useRef } from "react";
import { getScrollContainer } from "~/lib/scroll";

export const FEED_ITEM_SCROLL = {
  durationMs: 300,
  targetViewportPosition: 1 / 3,
  selectorAttribute: "data-item-id",
} as const;

export function getFeedItemElement(itemId: string | null) {
  if (!itemId) return null;
  const escapedItemId = CSS.escape(itemId);

  return document.querySelector(
    `[${FEED_ITEM_SCROLL.selectorAttribute}="${escapedItemId}"]`,
  );
}

export function getFirstRenderedFeedItemId() {
  return (
    document
      .querySelector(`[${FEED_ITEM_SCROLL.selectorAttribute}]`)
      ?.getAttribute(FEED_ITEM_SCROLL.selectorAttribute) ?? null
  );
}

function scrollFeedItemElementToTarget(
  element: Element,
  behavior: ScrollBehavior,
) {
  const container = getScrollContainer();
  const containerRect = container.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const targetPosition =
    containerRect.height * FEED_ITEM_SCROLL.targetViewportPosition;
  const scrollTop =
    container.scrollTop +
    (rect.top - containerRect.top) -
    targetPosition +
    rect.height / 2;

  container.scrollTo({ top: scrollTop, behavior });
}

export function useScrollToFeedItem() {
  const lastScrollTimeRef = useRef(0);

  return useCallback((itemId: string | null, forceInstant = false) => {
    const element = getFeedItemElement(itemId);
    if (!element) return false;

    const now = performance.now();
    const isRapid =
      now - lastScrollTimeRef.current < FEED_ITEM_SCROLL.durationMs;
    lastScrollTimeRef.current = now;

    const behavior = forceInstant || isRapid ? "instant" : "smooth";
    scrollFeedItemElementToTarget(element, behavior);
    return true;
  }, []);
}
