import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";
import { atom } from "jotai";
import { DatabaseFeed } from "~/server/db/schema";
import { FETCH_NEW_FEED_ITEMS_KEY } from "./feedItems";

const feedsAtom = atom<DatabaseFeed[]>([]);

export function useFeedsQuery() {
  return useQuery(
    useTRPC().feeds.getAll.queryOptions(undefined, {
      staleTime: Infinity,
    }),
  );
}

export function useCreateFeedMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.feeds.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: api.feeds.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: api.feedItems.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: api.feedCategories.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: FETCH_NEW_FEED_ITEMS_KEY,
        });
      },
    }),
  );
}

export function useDeleteFeedMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.feeds.delete.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: api.feeds.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: api.feedItems.getAll.queryKey(),
        });
      },
    }),
  );
}
