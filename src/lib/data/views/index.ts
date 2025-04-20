import { useQuery } from "@tanstack/react-query";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { useTRPC } from "~/trpc/react";
import { hasFetchedViewsAtom, viewsAtom } from "../atoms";

export function useViewsQuery() {
  const setHasFetchedViews = useSetAtom(hasFetchedViewsAtom);
  const setViews = useSetAtom(viewsAtom);

  const query = useQuery(
    useTRPC().contentCategories.getAll.queryOptions(undefined, {
      staleTime: Infinity,
    }),
  );

  useEffect(() => {
    if (query.isSuccess) {
      setHasFetchedViews(true);
      setViews(query.data);
    }
  }, [query]);

  return query;
}

export function useViews() {
  const [views, setViews] = useAtom(viewsAtom);
  const hasFetchedViews = useAtomValue(hasFetchedViewsAtom);
  const viewsQuery = useViewsQuery();

  return {
    views,
    setViews,
    viewsQuery,
    hasFetchedViews,
  };
}
