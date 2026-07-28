import { feedItemsStore } from "./store";
import { feedsStore } from "./feeds/store";
import { viewsStore } from "./views/store";
import { viewFeedsStore } from "./view-feeds/store";
import { contentCategoriesStore } from "./content-categories/store";
import { feedCategoriesStore } from "./feed-categories/store";
import { createHydrationHook } from "./useStoreHydration";

/**
 * Returns `true` once every persisted Zustand store has finished rehydrating
 * from IndexedDB. Use this to gate data-dependent rendering and to ensure
 * the SSE initial data request fires *after* cached state is in place.
 */
export const useStoresHydrated = createHydrationHook(
  feedItemsStore,
  feedsStore,
  viewsStore,
  viewFeedsStore,
  contentCategoriesStore,
  feedCategoriesStore,
);
