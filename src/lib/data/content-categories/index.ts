import { useEffect } from "react";
import {
  useContentCategoriesFetchStatus,
  useContentCategories as useContentCategoriesStore,
  useFetchContentCategories,
} from "./store";

export function useContentCategoriesQuery() {
  const fetchContentCategories = useFetchContentCategories();
  const fetchStatus = useContentCategoriesFetchStatus();

  useEffect(() => {
    if (fetchStatus === "idle") {
      void fetchContentCategories();
    }
  }, [fetchStatus, fetchContentCategories]);

  return {
    isLoading: fetchStatus === "fetching",
    isSuccess: fetchStatus === "success",
  };
}

export function useContentCategories() {
  const contentCategories = useContentCategoriesStore();
  const fetchStatus = useContentCategoriesFetchStatus();
  const contentCategoriesQuery = useContentCategoriesQuery();

  return {
    contentCategories,
    contentCategoriesQuery,
    hasFetchedContentCategories: fetchStatus === "success",
  };
}
