import { useQuery } from "@tanstack/react-query";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { useTRPC } from "~/trpc/react";
import {
  contentCategoriesAtom,
  hasFetchedContentCategoriesAtom,
} from "../atoms";

export function useContentCategoriesQuery() {
  const setHasFetchedContentCategories = useSetAtom(
    hasFetchedContentCategoriesAtom,
  );
  const setContentCategories = useSetAtom(contentCategoriesAtom);

  const query = useQuery(
    useTRPC().contentCategories.getAll.queryOptions(undefined, {
      staleTime: Infinity,
    }),
  );

  useEffect(() => {
    if (query.isSuccess) {
      setHasFetchedContentCategories(true);
      setContentCategories(query.data);
    }
  }, [query, setHasFetchedContentCategories, setContentCategories]);

  return query;
}

export function useContentCategories() {
  const [contentCategories, setContentCategories] = useAtom(
    contentCategoriesAtom,
  );
  const hasFetchedContentCategories = useAtomValue(
    hasFetchedContentCategoriesAtom,
  );
  const contentCategoriesQuery = useContentCategoriesQuery();

  return {
    contentCategories,
    setContentCategories,
    contentCategoriesQuery,
    hasFetchedContentCategories,
  };
}
