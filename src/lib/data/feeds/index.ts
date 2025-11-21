import { useQuery } from "@tanstack/react-query";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { orpc } from "~/lib/orpc";
import { feedsAtom, hasFetchedFeedsAtom } from "../atoms";
import { assembleIteratorResult } from "~/lib/iterators";

export function useFeedsQuery() {
  const setHasFetchedFeeds = useSetAtom(hasFetchedFeedsAtom);
  const setFeeds = useSetAtom(feedsAtom);

  const query = useQuery(
    orpc.feed.getAll.experimental_streamedOptions({
      staleTime: Infinity,
    }),
  );

  const hasUpdatedBasedOnQueryRef = useRef(false);
  useEffect(() => {
    if (query.fetchStatus === "fetching") {
      setFeeds((prevFeeds) =>
        assembleIteratorResult([prevFeeds, ...(query.data ?? [])]).sort(
          (a, b) => {
            if (a.updatedAt <= b.updatedAt) return 1;
            return -1;
          },
        ),
      );
    } else if (
      query.isSuccess &&
      query.fetchStatus === "idle" &&
      hasUpdatedBasedOnQueryRef.current === false
    ) {
      const data = assembleIteratorResult(query.data).sort((a, b) => {
        if (a.updatedAt <= b.updatedAt) return 1;
        return -1;
      });

      setHasFetchedFeeds(true);
      hasUpdatedBasedOnQueryRef.current = true;
      setFeeds(data);
    }
  }, [
    query.isSuccess,
    query.isFetching,
    query.fetchStatus,
    query.data,
    setHasFetchedFeeds,
    setFeeds,
  ]);

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
