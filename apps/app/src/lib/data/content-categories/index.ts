import {
  useContentCategoriesFetchStatus,
  useContentCategories as useContentCategoriesStore,
} from "./store";

export function useContentCategories() {
  const contentCategories = useContentCategoriesStore();
  const fetchStatus = useContentCategoriesFetchStatus();

  return {
    contentCategories,
    hasFetchedContentCategories: fetchStatus === "success",
  };
}
