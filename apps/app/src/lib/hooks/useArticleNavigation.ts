"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { atom, useSetAtom } from "jotai";
import { useShortcut } from "./useShortcut";
import type { KeyboardEvent, RefObject } from "react";
import {
  getShortcutAllowRepeat,
  getShortcutKeys,
  SHORTCUT_KEYS,
} from "~/lib/constants/shortcuts";
import { getScrollContainer } from "~/lib/scroll";

export const articleSelectedElementAtom = atom<HTMLElement | null>(null);

const SCROLL_DURATION_MS = 300;
const TARGET_VIEWPORT_POSITION = 1 / 3;
const SELECTABLE_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
  "IMG",
  "FIGURE",
  "LI",
]);
const INTERACTIVE_ROLES = new Set([
  "button",
  "checkbox",
  "link",
  "radio",
  "switch",
]);
const TEXT_BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, blockquote, figure, li";

function hasNavigableContent(element: HTMLElement): boolean {
  return !!(
    element.textContent?.trim() ||
    element.tagName === "IMG" ||
    element.tagName === "FIGURE" ||
    element.querySelector("img, iframe, video")
  );
}

function isAtomicDiv(element: HTMLElement): boolean {
  const role = element.getAttribute("role");
  const isInteractive = role ? INTERACTIVE_ROLES.has(role) : false;
  const isMediaOnly =
    !!element.querySelector("iframe, video") &&
    !element.querySelector(TEXT_BLOCK_SELECTOR);

  return (
    element.hasAttribute("data-lightbox") ||
    element.hasAttribute("data-article-video-embed") ||
    isInteractive ||
    isMediaOnly
  );
}

function getNavigableDescendants(container: HTMLElement): HTMLElement[] {
  const elements: HTMLElement[] = [];

  for (const child of container.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.hasAttribute("data-serial-header")) continue;

    if (SELECTABLE_TAGS.has(child.tagName)) {
      if (hasNavigableContent(child)) elements.push(child);
      continue;
    }

    if (child.tagName === "DIV") {
      if (isAtomicDiv(child)) {
        if (hasNavigableContent(child)) elements.push(child);
        continue;
      }

      const descendants = getNavigableDescendants(child);
      if (descendants.length > 0) {
        elements.push(...descendants);
      } else if (hasNavigableContent(child)) {
        elements.push(child);
      }
      continue;
    }

    elements.push(...getNavigableDescendants(child));
  }

  return elements;
}

export function getElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return getNavigableDescendants(container);
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
  const lastInputModalityRef = useRef<"keyboard" | "pointer">("keyboard");
  const suppressFocusInRef = useRef(false);
  const setArticleSelectedElement = useSetAtom(articleSelectedElementAtom);

  const applySelection = useCallback(
    (elements: HTMLElement[], index: number) => {
      // Remove all previous selections and blur any focused element
      if (containerRef.current) {
        containerRef.current
          .querySelectorAll("[data-article-selected]")
          .forEach((el) => {
            el.removeAttribute("data-article-selected");
            el.removeAttribute("tabindex");
          });
      }
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      if (index >= 0 && index < elements.length) {
        const el = elements[index]!;
        el.setAttribute("data-article-selected", "true");

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

        setArticleSelectedElement(el);
      } else {
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
      lightbox
        ?.querySelector<HTMLButtonElement>("[data-lightbox-trigger]")
        ?.click();
    },
    [containerRef, selectedIndex],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handlePointerDown = () => {
      lastInputModalityRef.current = "pointer";
    };
    const handleKeyDown = () => {
      lastInputModalityRef.current = "keyboard";
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (
        suppressFocusInRef.current ||
        lastInputModalityRef.current !== "keyboard"
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const elements = getElements(container);
      let parentIndex = -1;
      for (let index = 0; index < elements.length; index += 1) {
        const element = elements[index]!;
        if (element !== target && element.contains(target)) {
          parentIndex = index;
        }
      }
      if (parentIndex === -1 || parentIndex === selectedIndex) return;

      container
        .querySelectorAll("[data-article-selected]")
        .forEach((element) => {
          element.removeAttribute("data-article-selected");
          element.removeAttribute("tabindex");
        });
      const parent = elements[parentIndex]!;
      parent.setAttribute("data-article-selected", "true");
      if (parent.tagName === "LI") {
        const parentLeft = parent.getBoundingClientRect().left;
        const containerLeft = container.getBoundingClientRect().left;
        parent.style.setProperty(
          "--selection-offset",
          `${parentLeft - containerLeft - 20}px`,
        );
      }
      parent.setAttribute("tabindex", "-1");
      setSelectedIndex(parentIndex);
      setArticleSelectedElement(parent);
      scrollToElement(parent);
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    container.addEventListener("focusin", handleFocusIn);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      container.removeEventListener("focusin", handleFocusIn);
    };
  }, [containerRef, selectedIndex, setArticleSelectedElement, scrollToElement]);

  useShortcut(getShortcutKeys(SHORTCUT_KEYS.ARROW_DOWN), handleArrowDown, {
    allowRepeat: getShortcutAllowRepeat(SHORTCUT_KEYS.ARROW_DOWN),
  });

  useShortcut(getShortcutKeys(SHORTCUT_KEYS.ARROW_UP), handleArrowUp, {
    allowRepeat: getShortcutAllowRepeat(SHORTCUT_KEYS.ARROW_UP),
  });

  useShortcut(" ", handleSpace);

  return { scrollToElement };
}
