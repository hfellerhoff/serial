import {
  createFeedItemFilterIndex,
  createFeedItemFilterPredicate,
} from "../feed-items/listProjection";
import { feedCategoriesStore } from "../feed-categories/store";
import { feedItemsStore } from "../store";
import { getFeedItemScopeKey } from "../scopeMembership";
import { viewsStore } from "../views/store";
import { getMixedScopeKey, mixedContentStore } from "../mixed-content/store";
import {
  getNavigationAvailability,
  navigationSnapshotStore,
  refreshNavigationSnapshotSafely,
} from "./store";
import type { VisibilityFilter } from "../atoms";
import type { ApplicationFeedItem } from "~/server/db/schema";

const VISIBILITY_FILTERS: VisibilityFilter[] = ["unread", "read", "later"];
const NAVIGATION_REFRESH_DEBOUNCE_MS = 150;

let navigationRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleNavigationSnapshotRefresh() {
  if (navigationRefreshTimer) clearTimeout(navigationRefreshTimer);

  navigationRefreshTimer = setTimeout(() => {
    navigationRefreshTimer = null;
    void refreshNavigationSnapshotSafely();
  }, NAVIGATION_REFRESH_DEBOUNCE_MS);
}

function localBucketHasContent(
  viewId: number,
  visibilityFilter: VisibilityFilter,
  nextItemMatchesBucket: boolean,
) {
  const mixedScope =
    mixedContentStore.getState().scopes[
      getMixedScopeKey({ type: "view", viewId }, visibilityFilter)
    ];
  if (mixedScope) return mixedScope.references.length > 0;

  const feedItemScopeIds =
    feedItemsStore.getState().scopeFeedItemIds[
      getFeedItemScopeKey("view", viewId, visibilityFilter)
    ];
  if (feedItemScopeIds) return feedItemScopeIds.length > 0;

  // An unloaded bucket cannot prove that it is empty. It can, however, prove
  // that it now has content when the changed item matches its local filter.
  return nextItemMatchesBucket ? true : undefined;
}

function hasAvailabilityTransition(
  chipHasContent: boolean,
  localHasContent: boolean | undefined,
) {
  return localHasContent !== undefined && chipHasContent !== localHasContent;
}

/**
 * Checks whether an optimistic Feed-item visibility change crossed a local
 * empty/non-empty boundary represented by any View chip. The chip state is
 * intentionally the previous-state authority; the local stores provide only
 * the post-mutation signal.
 */
export function shouldRefreshNavigationAfterFeedItemChange(input: {
  previousItem: ApplicationFeedItem;
  nextItem: ApplicationFeedItem;
}) {
  const views = viewsStore.getState().views;
  const viewAvailability = viewsStore.getState().viewAvailability;
  const filterIndex = createFeedItemFilterIndex(
    feedCategoriesStore.getState().feedCategories,
    views,
  );

  for (const view of views) {
    for (const visibilityFilter of VISIBILITY_FILTERS) {
      const predicate = createFeedItemFilterPredicate({
        visibilityFilter,
        categoryFilter: -1,
        feedFilter: -1,
        viewFilter: view,
        filterIndex,
      });
      const previousItemMatchesBucket = predicate(input.previousItem);
      const nextItemMatchesBucket = predicate(input.nextItem);

      if (!previousItemMatchesBucket && !nextItemMatchesBucket) continue;

      const chipHasContent = getNavigationAvailability(
        viewAvailability,
        view.id,
      )[visibilityFilter];
      const localHasContent = localBucketHasContent(
        view.id,
        visibilityFilter,
        nextItemMatchesBucket,
      );

      if (hasAvailabilityTransition(chipHasContent, localHasContent)) {
        return true;
      }
    }
  }

  // The snapshot can contain the built-in View even if the hydrated View list
  // is temporarily incomplete. Include any such IDs using the same local
  // transition check when they have a tracked scope.
  const trackedViewIds = new Set(
    Object.keys(navigationSnapshotStore.getState().snapshot.views).map(Number),
  );
  for (const viewId of trackedViewIds) {
    if (views.some((view) => view.id === viewId)) continue;

    for (const visibilityFilter of VISIBILITY_FILTERS) {
      const chipHasContent = getNavigationAvailability(
        viewAvailability,
        viewId,
      )[visibilityFilter];
      const localHasContent = localBucketHasContent(
        viewId,
        visibilityFilter,
        false,
      );

      if (hasAvailabilityTransition(chipHasContent, localHasContent)) {
        return true;
      }
    }
  }

  return false;
}

export function refreshNavigationAfterFeedItemChangeIfNeeded(input: {
  previousItem: ApplicationFeedItem;
  nextItem: ApplicationFeedItem;
}) {
  if (shouldRefreshNavigationAfterFeedItemChange(input)) {
    scheduleNavigationSnapshotRefresh();
  }
}
