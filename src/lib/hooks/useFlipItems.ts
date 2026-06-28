"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSelector } from "@xstate/react";
import { loadingActor } from "~/lib/data/loading-machine";

// Duration of the slide/fade. Composited transform + opacity, so this is purely
// a visual timing knob — it does not gate any layout work.
const FLIP_DURATION_MS = 200;
// Small buffer so the animation finishes before the leaving node is unmounted.
const REMOVAL_DELAY_MS = FLIP_DURATION_MS + 50;
const FLIP_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

const NO_LEAVING_ITEMS: ReadonlySet<string> = new Set();
// Item ids are alphanumeric cuids, so joining on a space safely fingerprints
// list contents without depending on `items` being referentially stable (it
// is sliced fresh each render upstream).
const ITEM_ID_SEPARATOR = " ";

/**
 * Re-inserts items that were removed from `next` back into their previous
 * position so they can animate out in place. Additions and reorders are taken
 * straight from `next` (not animated); only removals are deferred.
 */
function mergeRenderedItems(prev: string[], next: string[]): string[] {
  const nextItemIds = new Set(next);
  const leavingIds = prev.filter((id) => !nextItemIds.has(id));
  if (leavingIds.length === 0) return next;

  const merged = [...next];
  // prev order is preserved, so an earlier leaving item is always spliced in
  // before we look for it as an anchor for a later one.
  for (const leavingId of leavingIds) {
    const prevIndex = prev.indexOf(leavingId);
    let insertAt = 0;
    for (let i = prevIndex - 1; i >= 0; i--) {
      const precedingPosition = merged.indexOf(prev[i]!);
      if (precedingPosition !== -1) {
        insertAt = precedingPosition + 1;
        break;
      }
    }
    merged.splice(insertAt, 0, leavingId);
  }
  return merged;
}

function getDirectFlipNodes(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(":scope > [data-flip-id]"),
  );
}

/**
 * Lifts a leaving node out of layout flow, pinned at its current on-screen
 * position, so the surviving siblings can collapse the gap. Skips nodes that
 * were already pinned by an earlier removal still in flight.
 */
function pinLeavingNode(node: HTMLElement, containerRect: DOMRect) {
  if (node.style.position === "absolute") return;

  const rect = node.getBoundingClientRect();
  node.style.position = "absolute";
  node.style.top = `${rect.top - containerRect.top}px`;
  node.style.left = `${rect.left - containerRect.left}px`;
  node.style.width = `${rect.width}px`;
  node.style.height = `${rect.height}px`;
  node.style.margin = "0";
  node.style.pointerEvents = "none";
  node.style.zIndex = "0";
}

/**
 * Drives a FLIP (First, Last, Invert, Play) animation for the surviving items
 * and a fade-out for the leaving ones, all using composited `transform` /
 * `opacity` so no layout runs per frame.
 *
 * Called from a layout effect, after the leaving items have been merged back
 * into the rendered list (so they are still in flow when "First" is measured).
 */
function playFlip(
  container: HTMLElement,
  leavingItems: ReadonlySet<string>,
): void {
  const nodes = getDirectFlipNodes(container);
  const survivors: HTMLElement[] = [];
  const leaving: HTMLElement[] = [];
  for (const node of nodes) {
    const id = node.dataset.flipId;
    if (id !== undefined && leavingItems.has(id)) {
      leaving.push(node);
    } else {
      survivors.push(node);
    }
  }

  // First: survivor positions while the leaving items still occupy the flow.
  // Live rects are used (rather than cached) so an interrupted animation
  // continues smoothly from wherever the elements currently are.
  const firstRects = new Map<HTMLElement, DOMRect>();
  for (const node of survivors) {
    firstRects.set(node, node.getBoundingClientRect());
  }

  // Lift leaving items out of flow so the gap closes.
  const containerRect = container.getBoundingClientRect();
  for (const node of leaving) {
    pinLeavingNode(node, containerRect);
  }

  // Last + Invert: pin survivors back to their old positions (this read forces
  // the one and only reflow of the whole operation).
  for (const node of survivors) {
    const first = firstRects.get(node);
    if (!first) continue;
    const last = node.getBoundingClientRect();
    const deltaX = first.left - last.left;
    const deltaY = first.top - last.top;
    if (deltaX === 0 && deltaY === 0) continue;
    node.style.transition = "none";
    node.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
  }

  // Play: next frame, release everything to its natural position / hidden.
  requestAnimationFrame(() => {
    for (const node of survivors) {
      if (!node.style.transform) continue;
      node.style.transition = `transform ${FLIP_DURATION_MS}ms ${FLIP_EASING}`;
      node.style.transform = "";
    }
    for (const node of leaving) {
      node.style.transition = `opacity ${FLIP_DURATION_MS}ms ${FLIP_EASING}, transform ${FLIP_DURATION_MS}ms ${FLIP_EASING}`;
      node.style.opacity = "0";
      node.style.transform = "scale(0.98)";
    }
  });
}

/**
 * Keeps removed item IDs mounted for one FLIP animation before dropping them.
 * Surviving siblings slide into the vacated space and the leaving item fades
 * out, all on the compositor (no per-frame layout). Removal is driven by a
 * per-id timer rather than `transitionend`, which is unreliable.
 *
 * While the loading machine is in `initialLoad`, removals are applied
 * immediately so cached items reconciled away on first paint don't animate.
 *
 * The returned `containerRef` must be placed on the element that directly wraps
 * the rendered `[data-flip-id]` items, and that element must be a positioned
 * ancestor (e.g. `relative`) so leaving items can be pinned within it.
 */
export function useFlipItems(items: string[]) {
  const isInitialLoad = useSelector(loadingActor, (s) =>
    s.matches("initialLoad"),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const removalTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );

  const itemsKey = items.join(ITEM_ID_SEPARATOR);
  const [state, setState] = useState({ key: itemsKey, rendered: items });

  // Adjust derived state during render (rather than in an effect) when the
  // incoming list changes, so removed items are retained for their animation
  // without an extra commit. Guarded by the content key, so re-renders that
  // produce an equal-but-new `items` array don't loop.
  if (state.key !== itemsKey) {
    setState({
      key: itemsKey,
      rendered: isInitialLoad
        ? items
        : mergeRenderedItems(state.rendered, items),
    });
  }

  const currentItemIds = new Set(items);
  const leavingItems: ReadonlySet<string> = isInitialLoad
    ? NO_LEAVING_ITEMS
    : new Set(state.rendered.filter((id) => !currentItemIds.has(id)));
  const leavingKey = [...leavingItems].join(ITEM_ID_SEPARATOR);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || leavingKey === "") return;

    const leavingIds: ReadonlySet<string> = new Set(
      leavingKey.split(ITEM_ID_SEPARATOR),
    );
    playFlip(container, leavingIds);

    // Schedule each leaving id's unmount exactly once. Timers are intentionally
    // not cleared when this effect re-runs (e.g. a later removal): each leaving
    // item owns its own clock, so rapid sequential removals don't pile up as
    // never-unmounted ghost nodes.
    const removalTimers = removalTimersRef.current;
    for (const id of leavingIds) {
      if (removalTimers.has(id)) continue;
      const timer = setTimeout(() => {
        removalTimers.delete(id);
        setState((prev) => ({
          key: prev.key,
          rendered: prev.rendered.filter((renderedId) => renderedId !== id),
        }));
      }, REMOVAL_DELAY_MS);
      removalTimers.set(id, timer);
    }
  }, [leavingKey]);

  useEffect(() => {
    const removalTimers = removalTimersRef.current;
    return () => {
      for (const timer of removalTimers.values()) clearTimeout(timer);
      removalTimers.clear();
    };
  }, []);

  return { renderedItems: state.rendered, containerRef };
}
