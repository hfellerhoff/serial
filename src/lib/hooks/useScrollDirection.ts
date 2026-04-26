import { useCallback, useEffect, useRef } from "react";
import { getScrollContainer } from "~/lib/scroll";

type ScrollDirection = "up" | "down";

const SCROLL_THRESHOLD = 10;

/**
 * Tracks scroll direction on the primary scroll container.
 * Returns "up" when scrolling up, "down" when scrolling down.
 * Includes a threshold to avoid jitter from small scrolls.
 */
export function useScrollDirection(
  onDirectionChange: (direction: ScrollDirection) => void,
) {
  const lastScrollTopRef = useRef(0);
  const lastDirectionRef = useRef<ScrollDirection>("up");

  const handleScroll = useCallback(() => {
    const container = getScrollContainer();
    const currentScrollTop = container.scrollTop;
    const delta = currentScrollTop - lastScrollTopRef.current;

    if (Math.abs(delta) < SCROLL_THRESHOLD) return;

    // Treat reaching the bottom of the document as scrolling up (show bars)
    const BOTTOM_THRESHOLD = 100;
    const isAtBottom =
      container.scrollHeight - currentScrollTop - container.clientHeight <
      BOTTOM_THRESHOLD;

    const direction: ScrollDirection = isAtBottom || delta < 0 ? "up" : "down";

    if (direction !== lastDirectionRef.current) {
      lastDirectionRef.current = direction;
      onDirectionChange(direction);
    }

    lastScrollTopRef.current = currentScrollTop;
  }, [onDirectionChange]);

  useEffect(() => {
    const container = getScrollContainer();
    lastScrollTopRef.current = container.scrollTop;

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll]);
}
