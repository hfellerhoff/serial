import { createStore } from "zustand";
import { createSelectorHooks } from "../createSelectorHooks";

export type CaptionsStore = {
  enabled: boolean;
  size: number;
  setEnabled: (enabled: boolean) => void;
  toggleEnabled: () => void;
  setSize: (size: number) => void;
  reset: () => void;
};

const vanillaCaptionsStore = createStore<CaptionsStore>()((set, get) => ({
  enabled: false,
  size: 0,

  setEnabled: (enabled) => set({ enabled }),
  toggleEnabled: () => set({ enabled: !get().enabled }),
  setSize: (size) => set({ size }),
  reset: () => set({ enabled: false, size: 0 }),
}));

export const captionsStore = createSelectorHooks(vanillaCaptionsStore);

export const {
  useEnabled: useCaptionsEnabled,
  useSize: useCaptionSize,
  useSetEnabled: useSetCaptionsEnabled,
  useToggleEnabled: useToggleCaptionsEnabled,
  useSetSize: useSetCaptionSize,
  useReset: useResetCaptions,
} = captionsStore;
