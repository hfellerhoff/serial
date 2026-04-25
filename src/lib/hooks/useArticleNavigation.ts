"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { atom, useSetAtom } from "jotai";
import { useShortcut } from "./useShortcut";
import type { KeyboardEvent, RefObject } from "react";
import {
  getShortcutAllowRepeat,
  getShortcutKey,
  SHORTCUT_KEYS,
} from "~/lib/constants/shortcuts";
import { getScrollContainer } from "~/lib/scroll";

export const articleSelectedElementAtom = atom<HTMLElement | null>(null);

const SCROLL_DURATION_MS = 300;
const TARGET_VIEWPORT_POSITION = 1 / 3;
const SELECTABLE =
  ":scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > blockquote, :scope > img, :scope > figure, :scope > div, li";

export function getElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(SELECTABLE)).filter(
    (el) =>
      !el.hasAttribute("data-serial-header") &&
      (el.textContent?.trim() ||
        el.tagName === "IMG" ||
        el.tagName === "FIGURE" ||
        el.querySelector("img")),
  );
}

export function isElementInViewport(element: Element): boolean {
  const container = getScrollContainer();
  const containerRect = container.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return rect.top < containerRect.bottom && rect.bottom > containerRect.top;
}

export function getClosestVisibleElement(elements: HTMLElement[]): number {
  const container = getScrollContainer();
  const containerRect = container.getBoundingClientRect();
  const viewportTarget =
    containerRect.top + containerRect.height * TARGET_VIEWPORT_POSITION;
  let closestIndex = -1;
  let closestDistance = Infinity;

  for (let i = 0; i < elements.length; i++) {
    const rect = elements[i]!.getBoundingClientRect();
    if (rect.bottom < containerRect.top || rect.top > containerRect.bottom)
      continue;

    const elementCenter = rect.top + rect.height / 2;
    const distance = Math.abs(elementCenter - viewportTarget);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = i;
    }
  }

  return closestIndex;
}

export function useArticleNavigation(
  containerRef: RefObject<HTMLElement | null>,
) {
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const lastNavTimeRef = useRef<number>(0);
  const prevSelectedRef = useRef<HTMLElement | null>(null);
  // Suppress focusin handler during programmatic focus from arrow key navigation
  const suppressFocusInRef = useRef(false);
  const setArticleSelectedElement = useSetAtom(articleSelectedElementAtom);

  const applySelection = useCallback(
    (
      elements: HTMLElement[],
      index: number,
      { faded = false }: { faded?: boolean } = {},
    ) => {
      // Remove all previous selections and blur any focused element
      if (containerRef.current) {
        containerRef.current
          .querySelectorAll("[data-article-selected]")
          .forEach((el) => {
            el.removeAttribute("data-article-selected");
            el.removeAttribute("data-selection-faded");
            el.removeAttribute("tabindex");
          });
      }
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      if (index >= 0 && index < elements.length) {
        const el = elements[index]!;
        el.setAttribute("data-article-selected", "true");
        if (faded) {
          el.setAttribute("data-selection-faded", "");
        }

        // Calculate offset for nested elements (li) so the selection bar
        // stays aligned with root-level content
        if (el.tagName === "LI" && containerRef.current) {
          const elLeft = el.getBoundingClientRect().left;
          const containerLeft =
            containerRef.current.getBoundingClientRect().left;
          const offset = elLeft - containerLeft - 20;
          el.style.setProperty("--selection-offset", `${offset}px`);
        }

        // Set tabindex so the element itself is focusable,
        // allowing Tab to naturally move to the first link inside
        el.setAttribute("tabindex", "-1");
        suppressFocusInRef.current = true;
        el.focus({ preventScroll: true });
        suppressFocusInRef.current = false;

        prevSelectedRef.current = el;
        setArticleSelectedElement(el);
      } else {
        prevSelectedRef.current = null;
        setArticleSelectedElement(null);
      }
    },
    [setArticleSelectedElement, containerRef],
  );

  const scrollToElement = useCallback(
    (element: HTMLElement, forceInstant = false) => {
      const container = getScrollContainer();
      const containerRect = container.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const hasImage =
        element.tagName === "IMG" ||
        element.tagName === "FIGURE" ||
        !!element.querySelector("img");
      const targetPosition = hasImage
        ? containerRect.height / 2
        : containerRect.height * TARGET_VIEWPORT_POSITION;
      const scrollTop =
        container.scrollTop +
        (rect.top - containerRect.top) -
        targetPosition +
        rect.height / 2;

      const now = performance.now();
      const isRapid = now - lastNavTimeRef.current < SCROLL_DURATION_MS;
      lastNavTimeRef.current = now;

      container.scrollTo({
        top: scrollTop,
        behavior: forceInstant || isRapid ? "instant" : "smooth",
      });
    },
    [],
  );

  const selectElement = useCallback(
    (elements: HTMLElement[], index: number, forceInstant = false) => {
      setSelectedIndex(index);
      applySelection(elements, index);
      if (index >= 0 && index < elements.length) {
        scrollToElement(elements[index]!, forceInstant);
      }
    },
    [applySelection, scrollToElement],
  );

  const handleArrowDown = useCallback(
    (event: KeyboardEvent) => {
      event.preventDefault();
      const elements = getElements(containerRef.current);
      if (elements.length === 0) return;

      if (selectedIndex === -1) {
        // No selection: pick closest visible or first
        if (getScrollContainer().scrollTop === 0) {
          selectElement(elements, 0);
        } else {
          const closest = getClosestVisibleElement(elements);
          selectElement(elements, closest >= 0 ? closest : 0);
        }
        return;
      }

      // If selected element is off-screen, snap to closest visible
      const selectedEl = elements[selectedIndex];
      if (selectedEl && !isElementInViewport(selectedEl)) {
        const closest = getClosestVisibleElement(elements);
        if (closest >= 0) {
          selectElement(elements, closest);
          return;
        }
      }

      // Move to next, or deselect and scroll to top
      const nextIndex = selectedIndex + 1;
      if (nextIndex < elements.length) {
        selectElement(elements, nextIndex);
      } else {
        setSelectedIndex(-1);
        applySelection(elements, -1);
        getScrollContainer().scrollTo({ top: 0, behavior: "instant" });
      }
    },
    [containerRef, selectedIndex, selectElement, applySelection],
  );

  const handleArrowUp = useCallback(
    (event: KeyboardEvent) => {
      event.preventDefault();
      const elements = getElements(containerRef.current);
      if (elements.length === 0) return;

      if (selectedIndex === -1) {
        if (getScrollContainer().scrollTop === 0) {
          selectElement(elements, elements.length - 1, true);
        } else {
          const closest = getClosestVisibleElement(elements);
          selectElement(elements, closest >= 0 ? closest : 0);
        }
        return;
      }

      // If selected element is off-screen, snap to closest visible
      const selectedEl = elements[selectedIndex];
      if (selectedEl && !isElementInViewport(selectedEl)) {
        const closest = getClosestVisibleElement(elements);
        if (closest >= 0) {
          selectElement(elements, closest);
          return;
        }
      }

      // Move to previous, or deselect and scroll to top
      if (selectedIndex > 0) {
        selectElement(elements, selectedIndex - 1);
      } else {
        setSelectedIndex(-1);
        applySelection(elements, -1);
        getScrollContainer().scrollTo({ top: 0, behavior: "instant" });
      }
    },
    [containerRef, selectedIndex, selectElement, applySelection],
  );

  const handleSpace = useCallback(
    (event: KeyboardEvent) => {
      event.preventDefault();
      const elements = getElements(containerRef.current);
      const selectedEl = selectedIndex >= 0 ? elements[selectedIndex] : null;
      if (!selectedEl) return;

      // Toggle lightbox if selected element is or contains a lightbox
      const lightbox = selectedEl.hasAttribute("data-lightbox")
        ? selectedEl
        : selectedEl.querySelector<HTMLElement>("[data-lightbox]");
      if (lightbox) {
        lightbox.click();
      }
    },
    [containerRef, selectedIndex],
  );

  // Track closest element on mouse/trackpad scroll — fade bar immediately, update position debounced
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let faded = false;

    const handleWheel = () => {
      // Fade the bar immediately on first wheel event
      if (!faded) {
        faded = true;
        const selected = containerRef.current?.querySelector(
          "[data-article-selected]",
        );
        if (selected) {
          selected.setAttribute("data-selection-faded", "");
        }
      }

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        faded = false;
        const elements = getElements(containerRef.current);
        if (elements.length === 0) return;
        const closest = getClosestVisibleElement(elements);
        if (closest >= 0 && closest !== selectedIndex) {
          setSelectedIndex(closest);
          applySelection(elements, closest, { faded: true });
        }
      }, 50);
    };

    window.addEventListener("wheel", handleWheel);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("wheel", handleWheel);
    };
  }, [containerRef, selectedIndex, applySelection]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleFocusIn = (e: FocusEvent) => {
      if (suppressFocusInRef.current) return;

      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const elements = getElements(container);
      // Find the closest (most specific) selectable element containing the target
      let parentIndex = -1;
      for (let i = 0; i < elements.length; i++) {
        if (elements[i]!.contains(target) && elements[i] !== target) {
          parentIndex = i;
        }
      }
      if (parentIndex === -1 || parentIndex === selectedIndex) return;

      // Clear all previous selections
      container.querySelectorAll("[data-article-selected]").forEach((el) => {
        el.removeAttribute("data-article-selected");
        el.removeAttribute("tabindex");
      });
      const el = elements[parentIndex]!;
      el.setAttribute("data-article-selected", "true");
      if (el.tagName === "LI" && container) {
        const elLeft = el.getBoundingClientRect().left;
        const containerLeft = container.getBoundingClientRect().left;
        const offset = elLeft - containerLeft - 20;
        el.style.setProperty("--selection-offset", `${offset}px`);
      }
      el.setAttribute("tabindex", "-1");
      prevSelectedRef.current = el;
      setSelectedIndex(parentIndex);
      setArticleSelectedElement(el);
      scrollToElement(el);
    };

    container.addEventListener("focusin", handleFocusIn);
    return () => container.removeEventListener("focusin", handleFocusIn);
  }, [containerRef, selectedIndex, setArticleSelectedElement, scrollToElement]);

  useShortcut(getShortcutKey(SHORTCUT_KEYS.ARROW_DOWN), handleArrowDown, {
    allowRepeat: getShortcutAllowRepeat(SHORTCUT_KEYS.ARROW_DOWN),
  });

  useShortcut(getShortcutKey(SHORTCUT_KEYS.ARROW_UP), handleArrowUp, {
    allowRepeat: getShortcutAllowRepeat(SHORTCUT_KEYS.ARROW_UP),
  });

  useShortcut(" ", handleSpace);

  return { selectedIndex, selectElement };
}
