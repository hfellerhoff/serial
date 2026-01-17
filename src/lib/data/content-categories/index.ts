import { useEffect } from "react";
import {
  useContentCategories as useContentCategoriesStore,
  useContentCategoriesFetchStatus,
  useFetchContentCategories,
} from "./store";

export function useContentCategoriesQuery() {
  const fetchContentCategories = useFetchContentCategories();
  const fetchStatus = useContentCategoriesFetchStatus();

  useEffect(() => {
    if (fetchStatus === "idle") {
      fetchContentCategories();
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
