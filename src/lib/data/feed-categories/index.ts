import { useQuery } from "@tanstack/react-query";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { useTRPC } from "~/trpc/react";
import { feedCategoriesAtom, hasFetchedFeedCategoriesAtom } from "../atoms";

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
  }, [query, setHasFetchedFeedCategories, setFeedCategories]);

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
