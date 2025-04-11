import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTRPC } from "~/trpc/react";
import { feedCategoriesAtom, hasFetchedFeedCategoriesAtom } from "../atoms";
import { useEffect } from "react";

export function useFeedCategoriesQuery() {
  const setHasFetchedFeedCategories = useSetAtom(hasFetchedFeedCategoriesAtom);
  const setFeedCategories = useSetAtom(feedCategoriesAtom);

  const query = useQuery(
    useTRPC().feedCategories.getAll.queryOptions(undefined, {
      staleTime: Infinity,
    }),
  );

  useEffect(() => {
    if (query.isSuccess) {
      setHasFetchedFeedCategories(true);
      setFeedCategories(query.data);
    }
  }, [query]);

  return query;
}

export function useFeedCategories() {
  const [feedCategories, setFeedCategories] = useAtom(feedCategoriesAtom);
  const hasFetchedFeedCategories = useAtomValue(hasFetchedFeedCategoriesAtom);
  const feedCategoriesQuery = useFeedCategoriesQuery();

  return {
    feedCategories,
    setFeedCategories,
    feedCategoriesQuery,
    hasFetchedFeedCategories,
  };
}
