import { useState } from "react";
import { toast } from "sonner";
import type { Dispatch, SetStateAction } from "react";
import type { useDialogStore } from "~/components/feed/dialogStore";
import type { useFeeds } from "~/lib/data/feeds";
import {
  useBulkAssignFeedCategoryMutation,
  useBulkRemoveFeedCategoryMutation,
} from "~/lib/data/feed-categories/mutations";
import {
  useBulkDeleteFeedsMutation,
  useBulkSetActiveMutation,
} from "~/lib/data/feeds/mutations";
import {
  useBulkAssignViewFeedMutation,
  useBulkRemoveViewFeedMutation,
} from "~/lib/data/view-feeds/mutations";
import { IS_DEMO_INSTANCE } from "~/lib/demo";

export type ManagedFeeds = ReturnType<typeof useFeeds>["feeds"];
export type ManagedFeed = ManagedFeeds[number];
export type LaunchDialog = ReturnType<
  typeof useDialogStore.getState
>["launchDialog"];

export function feedCountLabel(count: number) {
  return `${count} feed${count > 1 ? "s" : ""}`;
}

function getSharedIds(feedIds: number[], map: Map<number, number[]>) {
  if (feedIds.length === 0) return [];

  const firstFeedIds = map.get(feedIds[0]!) ?? [];
  const idSets = feedIds.map((feedId) => new Set(map.get(feedId) ?? []));
  return firstFeedIds.filter((id) => idSets.every((idSet) => idSet.has(id)));
}

function notifyActiveFeedLimitExceeded(
  overLimit: number,
  launchDialog: LaunchDialog,
) {
  if (IS_DEMO_INSTANCE) {
    toast.warning(
      `${overLimit} feed${overLimit > 1 ? "s would" : " would"} exceed the limit of active feeds you can have on the demo instance.`,
    );
  } else {
    toast.warning(
      `${overLimit} feed${overLimit > 1 ? "s would" : " would"} exceed your plan limit. To unlock more active feeds, you can switch to a higher plan.`,
      {
        action: {
          label: "Upgrade",
          onClick: () =>
            launchDialog("subscription", { subscriptionView: "picker" }),
        },
      },
    );
  }
}

function collectAssignmentPromises(
  selectedIds: number[],
  sharedIds: number[],
  assign: (id: number) => Promise<void>,
  remove: (id: number) => Promise<void>,
) {
  const selectedIdSet = new Set(selectedIds);
  const idsToRemove = sharedIds.filter((id) => !selectedIdSet.has(id));
  return [
    ...selectedIds.map((id) => assign(id)),
    ...idsToRemove.map((id) => remove(id)),
  ];
}

export function useBulkFeedEditing({
  canMutate,
  feeds,
  selectedFeedIds,
  setSelectedFeedIds,
  feedCategoriesMap,
  feedViewsMap,
  activeFeeds,
  maxActiveFeeds,
  launchDialog,
}: {
  canMutate: boolean;
  feeds: ManagedFeeds;
  selectedFeedIds: Set<number>;
  setSelectedFeedIds: Dispatch<SetStateAction<Set<number>>>;
  feedCategoriesMap: Map<number, number[]>;
  feedViewsMap: Map<number, number[]>;
  activeFeeds: number;
  maxActiveFeeds: number;
  launchDialog: LaunchDialog;
}) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [selectedViewIds, setSelectedViewIds] = useState<number[]>([]);
  const [bulkActiveState, setBulkActiveState] = useState(false);

  const { mutateAsync: bulkSetActive } = useBulkSetActiveMutation();
  const { mutateAsync: bulkDeleteFeeds, isPending: isDeletingFeeds } =
    useBulkDeleteFeedsMutation();
  const { mutateAsync: bulkAssignCategory, isPending: isAssigningCategory } =
    useBulkAssignFeedCategoryMutation();
  const { mutateAsync: bulkRemoveCategory, isPending: isRemovingCategory } =
    useBulkRemoveFeedCategoryMutation();
  const { mutateAsync: bulkAssignView, isPending: isAssigningView } =
    useBulkAssignViewFeedMutation();
  const { mutateAsync: bulkRemoveView, isPending: isRemovingView } =
    useBulkRemoveViewFeedMutation();

  const handleDelete = () => {
    if (!canMutate) return;
    const feedIds = Array.from(selectedFeedIds);
    const count = feedIds.length;
    setShowDeleteDialog(false);
    setSelectedFeedIds(new Set());

    toast.promise(bulkDeleteFeeds({ feedIds }), {
      loading: `Deleting ${feedCountLabel(count)}...`,
      success: `Deleted ${feedCountLabel(count)}!`,
      error: "Failed to delete feeds",
    });
  };

  const getSharedCategories = () =>
    getSharedIds(Array.from(selectedFeedIds), feedCategoriesMap);

  const getSharedViews = () =>
    getSharedIds(Array.from(selectedFeedIds), feedViewsMap);

  const openEditDialog = () => {
    setSelectedCategoryIds(getSharedCategories());
    setSelectedViewIds(getSharedViews());
    // If all selected feeds are active, show active; otherwise show deactivated
    const allActive = Array.from(selectedFeedIds).every(
      (id) => feeds.find((f) => f.id === id)?.isActive,
    );
    setBulkActiveState(allActive);
    setShowEditDialog(true);
  };

  const handleClear = () => {
    const feedIds = Array.from(selectedFeedIds);
    const count = feedIds.length;

    // Get all categories any selected feed currently has
    const allCurrentCategories = new Set<number>();
    feedIds.forEach((feedId) => {
      const categories = feedCategoriesMap.get(feedId) ?? [];
      categories.forEach((c) => allCurrentCategories.add(c));
    });

    // Get all views any selected feed currently has
    const allCurrentViews = new Set<number>();
    feedIds.forEach((feedId) => {
      const views = feedViewsMap.get(feedId) ?? [];
      views.forEach((v) => allCurrentViews.add(v));
    });

    if (allCurrentCategories.size === 0 && allCurrentViews.size === 0) return;

    const promises: Array<Promise<void>> = [
      ...Array.from(allCurrentCategories).map((categoryId) =>
        bulkRemoveCategory({ feedIds, categoryId }),
      ),
      ...Array.from(allCurrentViews).map((viewId) =>
        bulkRemoveView({ feedIds, viewId }),
      ),
    ];

    toast.promise(Promise.all(promises), {
      loading: `Clearing ${feedCountLabel(count)}...`,
      success: `Cleared ${feedCountLabel(count)}!`,
      error: "Failed to clear feeds",
    });
  };

  const handleEditSave = () => {
    if (!canMutate) return;
    const feedIds = Array.from(selectedFeedIds);
    const count = feedIds.length;
    const sharedCategories = getSharedCategories();
    const sharedViews = getSharedViews();

    // Active state
    const feedsToToggle = feedIds.filter((id) => {
      const feed = feeds.find((f) => f.id === id);
      return feed && feed.isActive !== bulkActiveState;
    });

    if (bulkActiveState && feedsToToggle.length > 0 && maxActiveFeeds >= 0) {
      const wouldBeActive = activeFeeds + feedsToToggle.length;

      if (wouldBeActive > maxActiveFeeds) {
        notifyActiveFeedLimitExceeded(
          wouldBeActive - maxActiveFeeds,
          launchDialog,
        );
        return;
      }
    }

    const promises: Array<Promise<void>> = [];

    // Bulk active state toggle
    if (feedsToToggle.length > 0) {
      promises.push(
        bulkSetActive({ feedIds: feedsToToggle, isActive: bulkActiveState }),
      );
    }

    // Categories
    promises.push(
      ...collectAssignmentPromises(
        selectedCategoryIds,
        sharedCategories,
        (categoryId) => bulkAssignCategory({ feedIds, categoryId }),
        (categoryId) => bulkRemoveCategory({ feedIds, categoryId }),
      ),
    );

    // Views
    promises.push(
      ...collectAssignmentPromises(
        selectedViewIds,
        sharedViews,
        (viewId) => bulkAssignView({ feedIds, viewId }),
        (viewId) => bulkRemoveView({ feedIds, viewId }),
      ),
    );

    setSelectedCategoryIds([]);
    setSelectedViewIds([]);
    setShowEditDialog(false);

    if (promises.length === 0) {
      return;
    }

    toast.promise(Promise.all(promises), {
      loading: `Updating ${feedCountLabel(count)}...`,
      success: `Updated ${feedCountLabel(count)}!`,
      error: "Failed to update feeds",
    });
  };

  const isSavingEdit =
    isAssigningCategory ||
    isRemovingCategory ||
    isAssigningView ||
    isRemovingView;
  const isClearing = isRemovingCategory || isRemovingView;

  return {
    showDeleteDialog,
    setShowDeleteDialog,
    showEditDialog,
    setShowEditDialog,
    selectedCategoryIds,
    setSelectedCategoryIds,
    selectedViewIds,
    setSelectedViewIds,
    bulkActiveState,
    setBulkActiveState,
    isDeletingFeeds,
    isSavingEdit,
    isClearing,
    handleDelete,
    openEditDialog,
    handleClear,
    handleEditSave,
  };
}
