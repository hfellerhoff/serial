import { useMutation } from "@tanstack/react-query";
import { feedItemsStore, useFeedItemState } from "../store";
import { feedCategoriesStore } from "../feed-categories/store";
import { mixedContentStore } from "../mixed-content/store";
import { viewsStore } from "../views/store";
import { refreshNavigationSnapshotSafely } from "../navigation/store";
import {
  clearPendingFeedItemOverride,
  setPendingWatchedOverride,
  setPendingWatchLaterOverride,
} from "./pendingMutations";
import { advanceFeedItemMembershipRevision } from "./membershipRevision";
import type { ApplicationFeedItem } from "~/server/db/schema";
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

type WatchedServerValue = {
  id?: string;
  isWatched: boolean;
  isWatchedUpdatedAt: Date | null;
  updatedAt: Date;
};

function setFeedItemsWithMixedProjection(items: ApplicationFeedItem[]) {
  if (items.length === 0) return;
  const store = feedItemsStore.getState();
  const previousFeedItems = Object.fromEntries(
    items.map((item) => [item.id, store.feedItemsDict[item.id]]),
  );
  store.setFeedItems(items);
  mixedContentStore.getState().reprojectFeedItems({
    itemIds: items.map((item) => item.id),
    previousFeedItems,
    feedItems: store.feedItemsDict,
    views: viewsStore.getState().views,
    feedCategories: feedCategoriesStore.getState().feedCategories,
  });
}

export function applyOptimisticWatchedValues(
  items: Array<{ id: string }>,
  isWatched: boolean,
) {
  const store = feedItemsStore.getState();
  const isWatchedUpdatedAt = isWatched ? new Date() : null;
  const contexts: OptimisticWatchedContext[] = [];
  const updatedItems = items.flatMap(({ id }) => {
    const feedItem = store.feedItemsDict[id];
    if (!feedItem) return [];

    const token = setPendingWatchedOverride(id, isWatched, isWatchedUpdatedAt);
    contexts.push({
      itemId: id,
      token,
      previousIsWatched: feedItem.isWatched,
      previousIsWatchedUpdatedAt: feedItem.isWatchedUpdatedAt,
    });
    return [{ ...feedItem, isWatched, isWatchedUpdatedAt }];
  });
  if (updatedItems.length > 0) {
    advanceFeedItemMembershipRevision();
    setFeedItemsWithMixedProjection(updatedItems);
  }
  return contexts;
}

export function applyOptimisticWatchedValue(
  itemId: string,
  isWatched: boolean,
): OptimisticWatchedContext | undefined {
  return applyOptimisticWatchedValues([{ id: itemId }], isWatched)[0];
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
  advanceFeedItemMembershipRevision();
  setFeedItemsWithMixedProjection([
    { ...feedItem, isWatchLater, isWatchLaterUpdatedAt },
  ]);

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
  rollbackOptimisticWatchedValues(context ? [context] : []);
}

export function rollbackOptimisticWatchedValues(
  contexts: OptimisticWatchedContext[],
) {
  settleOptimisticWatchedValues(contexts, []);
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

  setFeedItemsWithMixedProjection([
    {
      ...currentItem,
      isWatchLater: context.previousIsWatchLater,
      isWatchLaterUpdatedAt: context.previousIsWatchLaterUpdatedAt,
    },
  ]);
}

export function resolveOptimisticWatchedValue(
  context: OptimisticWatchedContext | undefined,
  serverValue: WatchedServerValue,
) {
  if (context) settleOptimisticWatchedValues([context], [serverValue]);
}

export function settleOptimisticWatchedValues(
  contexts: OptimisticWatchedContext[],
  serverItems: WatchedServerValue[],
) {
  const store = feedItemsStore.getState();
  const serverItemsById = new Map(
    serverItems.flatMap((item) => (item.id ? [[item.id, item] as const] : [])),
  );
  const singleServerItem =
    contexts.length === 1 && serverItems.length === 1
      ? serverItems[0]
      : undefined;
  const updatedItems = contexts.flatMap((context) => {
    if (
      !clearPendingFeedItemOverride(context.itemId, "isWatched", context.token)
    ) {
      return [];
    }
    const currentItem = store.feedItemsDict[context.itemId];
    if (!currentItem) return [];
    const serverItem = serverItemsById.get(context.itemId) ?? singleServerItem;
    return [
      serverItem
        ? { ...currentItem, ...serverItem }
        : {
            ...currentItem,
            isWatched: context.previousIsWatched,
            isWatchedUpdatedAt: context.previousIsWatchedUpdatedAt,
          },
    ];
  });
  setFeedItemsWithMixedProjection(updatedItems);
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

  setFeedItemsWithMixedProjection([{ ...currentItem, ...serverValue }]);
}

export async function setBulkWatchedValue({
  items,
  isWatched,
}: {
  items: BulkWatchedItem[];
  isWatched: boolean;
}) {
  const contexts = applyOptimisticWatchedValues(items, isWatched);

  try {
    const serverItems = await orpcRouterClient.feedItem.setBulkWatchedValue({
      items,
      isWatched,
    });
    settleOptimisticWatchedValues(contexts, serverItems ?? []);
    await refreshNavigationSnapshotSafely();
  } catch (error) {
    rollbackOptimisticWatchedValues(contexts);
    throw error;
  }
}

export function useFeedItemsSetWatchedValueMutation(contentId: string) {
  return useMutation(
    orpc.feedItem.setWatchedValue.mutationOptions({
      onMutate: ({ isWatched }) => {
        return applyOptimisticWatchedValue(contentId, isWatched);
      },
      onSuccess: async (serverValue, _variables, context) => {
        resolveOptimisticWatchedValue(context, serverValue);
        await refreshNavigationSnapshotSafely();
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
      onSuccess: async (serverValue, _variables, context) => {
        resolveOptimisticWatchLaterValue(context, serverValue);
        await refreshNavigationSnapshotSafely();
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
        return applyOptimisticWatchedValues(items, isWatched);
      },
      onSuccess: async (serverItems, _variables, contexts) => {
        settleOptimisticWatchedValues(contexts ?? [], serverItems ?? []);
        await refreshNavigationSnapshotSafely();
      },
      onError: (_error, _variables, contexts) => {
        rollbackOptimisticWatchedValues(contexts ?? []);
      },
    }),
  );
}
