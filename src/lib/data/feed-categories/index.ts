import { useEffect } from "react";
import {
  useFeedCategoriesFetchStatus,
  useFeedCategories as useFeedCategoriesStore,
  useFetchFeedCategories,
} from "./store";

export function useFeedCategoriesQuery() {
  const fetchFeedCategories = useFetchFeedCategories();
  const fetchStatus = useFeedCategoriesFetchStatus();

  useEffect(() => {
    if (fetchStatus === "idle") {
      void fetchFeedCategories();
    }
  }, [fetchStatus, fetchFeedCategories]);

  return {
    isLoading: fetchStatus === "fetching",
    isSuccess: fetchStatus === "success",
  };
}

export function useFeedCategories() {
  const feedCategories = useFeedCategoriesStore();
  const fetchStatus = useFeedCategoriesFetchStatus();
  const feedCategoriesQuery = useFeedCategoriesQuery();

  return {
    feedCategories,
    feedCategoriesQuery,
    hasFetchedFeedCategories: fetchStatus === "success",
  };
}
