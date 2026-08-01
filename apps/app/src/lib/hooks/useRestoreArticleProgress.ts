"use client";

import { useLayoutEffect, useRef } from "react";
import { getElements } from "./useArticleNavigation";
import { getScrollContainer } from "~/lib/scroll";

const TARGET_VIEWPORT_POSITION = 1 / 3;

export function useRestoreArticleProgress({
  contentId,
  articleElement,
  progress,
  ready = true,
}: {
  contentId: string;
  articleElement: HTMLElement | null;
  progress: number | undefined;
  ready?: boolean;
}) {
  const restoredContentIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (
      !ready ||
      !articleElement ||
      progress === undefined ||
      restoredContentIdRef.current === contentId
    ) {
      return;
    }
    const savedProgress = progress;
    const contentElement = articleElement;

    let firstFrame = 0;
    let secondFrame = 0;
    const observer = new MutationObserver(() => scheduleRestore());

    function scheduleRestore() {
      if (firstFrame || restoredContentIdRef.current === contentId) return;
      const elements = getElements(contentElement);
      if (
        elements.length === 0 ||
        contentElement.querySelector("[data-reader-content-pending]")
      ) {
        return;
      }

      firstFrame = requestAnimationFrame(() => {
        firstFrame = 0;
        secondFrame = requestAnimationFrame(() => {
          secondFrame = 0;
          const renderedElements = getElements(contentElement);
          if (
            renderedElements.length === 0 ||
            contentElement.querySelector("[data-reader-content-pending]")
          ) {
            return;
          }

          restoredContentIdRef.current = contentId;
          observer.disconnect();
          const container = getScrollContainer();
          if (savedProgress <= 0) {
            container.scrollTo({ top: 0, behavior: "instant" });
            return;
          }

          const element =
            renderedElements[
              Math.min(savedProgress, renderedElements.length - 1)
            ]!;
          const containerRect = container.getBoundingClientRect();
          const elementRect = element.getBoundingClientRect();
          const scrollTop =
            container.scrollTop +
            (elementRect.top - containerRect.top) -
            containerRect.height * TARGET_VIEWPORT_POSITION +
            elementRect.height / 2;
          container.scrollTo({ top: scrollTop, behavior: "instant" });
        });
      });
    }

    observer.observe(contentElement, { childList: true, subtree: true });
    scheduleRestore();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [articleElement, contentId, progress, ready]);
}
