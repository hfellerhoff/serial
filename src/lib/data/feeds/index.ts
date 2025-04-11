import { useQuery } from "@tanstack/react-query";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { useTRPC } from "~/trpc/react";
import { feedsAtom, hasFetchedFeedsAtom } from "../atoms";

export function useFeedsQuery() {
  const setHasFetchedFeeds = useSetAtom(hasFetchedFeedsAtom);
  const setFeeds = useSetAtom(feedsAtom);

  const query = useQuery(
    useTRPC().feeds.getAll.queryOptions(undefined, {
      staleTime: Infinity,
    }),
  );

  useEffect(() => {
    if (query.isSuccess) {
      setHasFetchedFeeds(true);
      setFeeds(query.data);
    }
  }, [query, setHasFetchedFeeds, setFeeds]);

  return query;
}

export function useFeeds() {
  const [feeds, setFeeds] = useAtom(feedsAtom);
  const hasFetchedFeeds = useAtomValue(hasFetchedFeedsAtom);
  const feedsQuery = useFeedsQuery();

  return {
    feeds,
    setFeeds,
    feedsQuery,
    hasFetchedFeeds,
  };
}
