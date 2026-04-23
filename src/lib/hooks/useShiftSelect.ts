import { useCallback, useRef } from "react";

/**
 * Hook that adds shift-click range selection to a list of items.
 *
 * @param filteredIds - The ordered array of visible item IDs.
 * @param setSelectedIds - State setter for the selected IDs set.
 * @returns A `handleSelect` function to use in place of a plain toggle.
 *          Call it with `(id, event)` from onClick handlers.
 */
export function useShiftSelect(
  filteredIds: number[],
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<number>>>,
) {
  const lastSelectedId = useRef<number | null>(null);

  const handleSelect = useCallback(
    (id: number, event?: { shiftKey?: boolean }) => {
      if (event?.shiftKey && lastSelectedId.current !== null) {
        const lastIndex = filteredIds.indexOf(lastSelectedId.current);
        const currentIndex = filteredIds.indexOf(id);

        if (lastIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(lastIndex, currentIndex);
          const end = Math.max(lastIndex, currentIndex);
          const rangeIds = filteredIds.slice(start, end + 1);

          setSelectedIds((prev) => {
            const next = new Set(prev);
            rangeIds.forEach((rangeId) => next.add(rangeId));
            return next;
          });
          lastSelectedId.current = id;
          return;
        }
      }

      // Normal toggle
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      lastSelectedId.current = id;
    },
    [filteredIds, setSelectedIds],
  );

  return handleSelect;
}
