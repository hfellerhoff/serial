import { create } from "zustand";
import type { ImportFeedDataFromFilesResult } from "~/components/feed/import/utils/shared";

type ImportDropStore = {
  pendingResult: ImportFeedDataFromFilesResult | null;
  setPendingResult: (result: ImportFeedDataFromFilesResult) => void;
  clearPendingResult: () => void;
};

export const useImportDropStore = create<ImportDropStore>((set) => ({
  pendingResult: null,
  setPendingResult: (pendingResult) => set({ pendingResult }),
  clearPendingResult: () => set({ pendingResult: null }),
}));
