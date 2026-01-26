import { createStore } from "zustand";
import { createSelectorHooks } from "./createSelectorHooks";

export type VisibleItemsStore = {
  visibleIndices: Set<number>;
  addVisibleIndex: (index: number) => void;
  removeVisibleIndex: (index: number) => void;
  reset: () => void;
};

const vanillaVisibleItemsStore = createStore<VisibleItemsStore>()((set) => ({
  visibleIndices: new Set<number>(),
  addVisibleIndex: (index: number) => {
    set((state) => {
      if (state.visibleIndices.has(index)) return state;
      const newSet = new Set(state.visibleIndices);
      newSet.add(index);
      return { visibleIndices: newSet };
    });
  },
  removeVisibleIndex: (index: number) => {
    set((state) => {
      if (!state.visibleIndices.has(index)) return state;
      const newSet = new Set(state.visibleIndices);
      newSet.delete(index);
      return { visibleIndices: newSet };
    });
  },
  reset: () => set({ visibleIndices: new Set<number>() }),
}));

export const visibleItemsStore = createSelectorHooks(vanillaVisibleItemsStore);

export const {
  useVisibleIndices,
  useAddVisibleIndex,
  useRemoveVisibleIndex,
  useReset: useResetVisibleItems,
} = visibleItemsStore;

// Computed hook: returns the max index of currently visible items, or -1 if none
export const useLastFullyVisibleIndex = () => {
  const visibleIndices = useVisibleIndices();
  if (visibleIndices.size === 0) return -1;
  return Math.max(...visibleIndices);
};
