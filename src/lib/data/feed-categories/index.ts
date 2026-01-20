import {
  useFeedCategoriesFetchStatus,
  useFeedCategories as useFeedCategoriesStore,
} from "./store";

export function useFeedCategories() {
  const feedCategories = useFeedCategoriesStore();
  const fetchStatus = useFeedCategoriesFetchStatus();

  return {
    feedCategories,
    hasFetchedFeedCategories: fetchStatus === "success",
  };
}
