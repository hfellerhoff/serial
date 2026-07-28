import { useMutation } from "@tanstack/react-query";
import { useFetchFeedCategories } from "../feed-categories/store";
import { useFetchViews, useSetViews } from "../views/store";
import { useFetchContentCategories } from "./store";
import { orpc } from "~/lib/orpc";

export function useCreateContentCategoryMutation() {
  const fetchContentCategories = useFetchContentCategories();
  const fetchFeedCategories = useFetchFeedCategories();

  return useMutation(
    orpc.contentCategories.create.mutationOptions({
      onSuccess: async () => {
        await fetchContentCategories();
        await fetchFeedCategories();
      },
    }),
  );
}

export function useUpdateContentCategoryMutation() {
  const fetchContentCategories = useFetchContentCategories();
  const fetchFeedCategories = useFetchFeedCategories();

  return useMutation(
    orpc.contentCategories.update.mutationOptions({
      onSuccess: async () => {
        await fetchContentCategories();
        await fetchFeedCategories();
      },
    }),
  );
}

export function useDeleteContentCategoryMutation() {
  const fetchContentCategories = useFetchContentCategories();
  const fetchFeedCategories = useFetchFeedCategories();
  const setViews = useSetViews();
  const fetchViews = useFetchViews();

  return useMutation(
    orpc.contentCategories.deleteCategory.mutationOptions({
      onSuccess: async () => {
        await fetchContentCategories();
        await fetchFeedCategories();
        // Reset views and refetch to recompute Uncategorized view categories
        setViews([]);
        await fetchViews();
      },
    }),
  );
}
