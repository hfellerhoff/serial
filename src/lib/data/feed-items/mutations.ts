import { useMutation } from "@tanstack/react-query";
import { feedItemsStore, useFeedItemState } from "../store";
import {
  clearPendingFeedItemOverride,
  setPendingWatchedOverride,
  setPendingWatchLaterOverride,
} from "./pendingMutations";
import { orpc, orpcRouterClient } from "~/lib/orpc";

type BulkWatchedItem = {
  id: string;
  feedId: number;
};

export type OptimisticWatchedContext = {
  itemId: string;
  token: object;
  previousIsWatched: boolean;
  previousIsWatchedUpdatedAt: Date | null;
};

export type OptimisticWatchLaterContext = {
  itemId: string;
  token: object;
  previousIsWatchLater: boolean;
  previousIsWatchLaterUpdatedAt: Date | null;
};

export function applyOptimisticWatchedValue(
  itemId: string,
  isWatched: boolean,
): OptimisticWatchedContext | undefined {
  const store = feedItemsStore.getState();
  const feedItem = store.feedItemsDict[itemId];
  if (!feedItem) return;

  const isWatchedUpdatedAt = isWatched ? new Date() : null;
  const token = setPendingWatchedOverride(
    itemId,
    isWatched,
    isWatchedUpdatedAt,
  );
  store.setFeedItem(itemId, {
    ...feedItem,
    isWatched,
    isWatchedUpdatedAt,
  });

  return {
    itemId,
    token,
    previousIsWatched: feedItem.isWatched,
    previousIsWatchedUpdatedAt: feedItem.isWatchedUpdatedAt,
  };
}

export function applyOptimisticWatchLaterValue(
  itemId: string,
  isWatchLater: boolean,
): OptimisticWatchLaterContext | undefined {
  const store = feedItemsStore.getState();
  const feedItem = store.feedItemsDict[itemId];
  if (!feedItem) return;

  const isWatchLaterUpdatedAt = new Date();
  const token = setPendingWatchLaterOverride(
    itemId,
    isWatchLater,
    isWatchLaterUpdatedAt,
  );
  store.setFeedItem(itemId, {
    ...feedItem,
    isWatchLater,
    isWatchLaterUpdatedAt,
  });

  return {
    itemId,
    token,
    previousIsWatchLater: feedItem.isWatchLater,
    previousIsWatchLaterUpdatedAt: feedItem.isWatchLaterUpdatedAt,
  };
}

export function rollbackOptimisticWatchedValue(
  context: OptimisticWatchedContext | undefined,
) {
  if (
    !context ||
    !clearPendingFeedItemOverride(context.itemId, "isWatched", context.token)
  ) {
    return;
  }

  const store = feedItemsStore.getState();
  const currentItem = store.feedItemsDict[context.itemId];
  if (!currentItem) return;

  store.setFeedItem(context.itemId, {
    ...currentItem,
    isWatched: context.previousIsWatched,
    isWatchedUpdatedAt: context.previousIsWatchedUpdatedAt,
  });
}

export function rollbackOptimisticWatchLaterValue(
  context: OptimisticWatchLaterContext | undefined,
) {
  if (
    !context ||
    !clearPendingFeedItemOverride(context.itemId, "isWatchLater", context.token)
  ) {
    return;
  }

  const store = feedItemsStore.getState();
  const currentItem = store.feedItemsDict[context.itemId];
  if (!currentItem) return;

  store.setFeedItem(context.itemId, {
    ...currentItem,
    isWatchLater: context.previousIsWatchLater,
    isWatchLaterUpdatedAt: context.previousIsWatchLaterUpdatedAt,
  });
}

export function resolveOptimisticWatchedValue(
  context: OptimisticWatchedContext | undefined,
  serverValue: {
    isWatched: boolean;
    isWatchedUpdatedAt: Date | null;
    updatedAt: Date;
  },
) {
  if (
    !context ||
    !clearPendingFeedItemOverride(context.itemId, "isWatched", context.token)
  ) {
    return;
  }

  const store = feedItemsStore.getState();
  const currentItem = store.feedItemsDict[context.itemId];
  if (!currentItem) return;

  store.setFeedItem(context.itemId, {
    ...currentItem,
    ...serverValue,
  });
}

export function resolveOptimisticWatchLaterValue(
  context: OptimisticWatchLaterContext | undefined,
  serverValue: {
    isWatchLater: boolean;
    isWatchLaterUpdatedAt: Date | null;
    updatedAt: Date;
  },
) {
  if (
    !context ||
    !clearPendingFeedItemOverride(context.itemId, "isWatchLater", context.token)
  ) {
    return;
  }

  const store = feedItemsStore.getState();
  const currentItem = store.feedItemsDict[context.itemId];
  if (!currentItem) return;

  store.setFeedItem(context.itemId, {
    ...currentItem,
    ...serverValue,
  });
}

export async function setBulkWatchedValue({
  items,
  isWatched,
}: {
  items: BulkWatchedItem[];
  isWatched: boolean;
}) {
  const contexts = items.map(({ id }) =>
    applyOptimisticWatchedValue(id, isWatched),
  );

  try {
    const serverItems = await orpcRouterClient.feedItem.setBulkWatchedValue({
      items,
      isWatched,
    });
    contexts.forEach((context) => {
      const serverItem = serverItems?.find(
        (candidateItem) => candidateItem.id === context?.itemId,
      );
      if (serverItem) {
        resolveOptimisticWatchedValue(context, serverItem);
      } else {
        rollbackOptimisticWatchedValue(context);
      }
    });
  } catch (error) {
    contexts.forEach(rollbackOptimisticWatchedValue);
    throw error;
  }
}

export function useFeedItemsSetWatchedValueMutation(contentId: string) {
  return useMutation(
    orpc.feedItem.setWatchedValue.mutationOptions({
      onMutate: ({ isWatched }) => {
        return applyOptimisticWatchedValue(contentId, isWatched);
      },
      onSuccess: (serverValue, _variables, context) => {
        resolveOptimisticWatchedValue(context, serverValue);
      },
      onError: (_error, _variables, context) => {
        rollbackOptimisticWatchedValue(context);
      },
    }),
  );
}

export function useFeedItemsSetWatchLaterValueMutation(contentId: string) {
  return useMutation(
    orpc.feedItem.setWatchLaterValue.mutationOptions({
      onMutate: ({ isWatchLater }) => {
        return applyOptimisticWatchLaterValue(contentId, isWatchLater);
      },
      onSuccess: (serverValue, _variables, context) => {
        resolveOptimisticWatchLaterValue(context, serverValue);
      },
      onError: (_error, _variables, context) => {
        rollbackOptimisticWatchLaterValue(context);
      },
    }),
  );
}

export function useSetProgressMutation(contentId: string) {
  const [feedItem, setFeedItem] = useFeedItemState(contentId);

  return useMutation(
    orpc.feedItem.setProgress.mutationOptions({
      onMutate: ({ progress, duration }) => {
        if (!feedItem) return;
        setFeedItem({ ...feedItem, progress, duration });
      },
    }),
  );
}

export function useBulkSetWatchedValueMutation() {
  return useMutation(
    orpc.feedItem.setBulkWatchedValue.mutationOptions({
      onMutate: ({ items, isWatched }) => {
        return items.map(({ id }) =>
          applyOptimisticWatchedValue(id, isWatched),
        );
      },
      onSuccess: (serverItems, _variables, contexts) => {
        contexts?.forEach((context) => {
          const serverItem = serverItems?.find(
            (candidateItem) => candidateItem.id === context?.itemId,
          );
          if (serverItem) {
            resolveOptimisticWatchedValue(context, serverItem);
          } else {
            rollbackOptimisticWatchedValue(context);
          }
        });
      },
      onError: (_error, _variables, contexts) => {
        contexts?.forEach(rollbackOptimisticWatchedValue);
      },
    }),
  );
}
