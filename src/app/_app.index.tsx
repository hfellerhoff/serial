import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import type { VisibilityFilter } from "~/lib/data/atoms";
import {
  viewFilterIdAtom,
  viewsAtom,
  visibilityFilterAtom,
} from "~/lib/data/atoms";
import { ClientDatetime } from "~/components/feed/ClientDatetime";
import { ItemVisibilityChips } from "~/components/feed/ItemVisibilityChips";
import { MarkVisibleAsReadButton } from "~/components/feed/MarkVisibleAsReadButton";
import { RenderViewItems } from "~/components/feed/view-lists";
import { ViewFilterChips } from "~/components/feed/ViewFilterChips";
import { useUpdateViewFilter } from "~/lib/data/views";
import { useShortcut } from "~/lib/hooks/useShortcut";
import { SHORTCUT_KEYS } from "~/lib/constants/shortcuts";
import { useFeeds } from "~/lib/data/feeds";
import { useHasInitialData } from "~/lib/data/store";
import FeedLoading from "~/components/loading";
import { FeedEmptyState } from "~/components/feed/view-lists/EmptyStates";

export const Route = createFileRoute("/_app/")({
  component: Home,
});

function Home() {
  const views = useAtomValue(viewsAtom);
  const viewFilterId = useAtomValue(viewFilterIdAtom);
  const updateViewFilter = useUpdateViewFilter();
  const setVisibilityFilter = useSetAtom(visibilityFilterAtom);

  useShortcut(
    SHORTCUT_KEYS.VIEW_1,
    () => views[0] && updateViewFilter(views[0].id),
  );
  useShortcut(
    SHORTCUT_KEYS.VIEW_2,
    () => views[1] && updateViewFilter(views[1].id),
  );
  useShortcut(
    SHORTCUT_KEYS.VIEW_3,
    () => views[2] && updateViewFilter(views[2].id),
  );
  useShortcut(
    SHORTCUT_KEYS.VIEW_4,
    () => views[3] && updateViewFilter(views[3].id),
  );
  useShortcut(
    SHORTCUT_KEYS.VIEW_5,
    () => views[4] && updateViewFilter(views[4].id),
  );
  useShortcut(
    SHORTCUT_KEYS.VIEW_6,
    () => views[5] && updateViewFilter(views[5].id),
  );
  useShortcut(
    SHORTCUT_KEYS.VIEW_7,
    () => views[6] && updateViewFilter(views[6].id),
  );
  useShortcut(
    SHORTCUT_KEYS.VIEW_8,
    () => views[7] && updateViewFilter(views[7].id),
  );
  useShortcut(
    SHORTCUT_KEYS.VIEW_9,
    () => views[8] && updateViewFilter(views[8].id),
  );
  useShortcut(
    SHORTCUT_KEYS.VIEW_10,
    () => views[9] && updateViewFilter(views[9].id),
  );

  useShortcut(SHORTCUT_KEYS.UNREAD, () =>
    setVisibilityFilter("unread" as VisibilityFilter),
  );
  useShortcut(SHORTCUT_KEYS.READ, () =>
    setVisibilityFilter("read" as VisibilityFilter),
  );
  useShortcut(SHORTCUT_KEYS.LATER, () =>
    setVisibilityFilter("later" as VisibilityFilter),
  );

  useShortcut(SHORTCUT_KEYS.PREV_VIEW, () => {
    if (views.length === 0) return;
    const currentIndex = views.findIndex((v) => v.id === viewFilterId);
    const prevIndex = currentIndex <= 0 ? views.length - 1 : currentIndex - 1;
    updateViewFilter(views[prevIndex]!.id);
  });

  useShortcut(SHORTCUT_KEYS.NEXT_VIEW, () => {
    if (views.length === 0) return;
    const currentIndex = views.findIndex((v) => v.id === viewFilterId);
    const nextIndex = currentIndex >= views.length - 1 ? 0 : currentIndex + 1;
    updateViewFilter(views[nextIndex]!.id);
  });

  const hasInitialData = useHasInitialData();
  const { feeds, hasFetchedFeeds } = useFeeds();

  if (!hasInitialData) {
    return <FeedLoading />;
  }

  if (hasFetchedFeeds && !feeds.length) {
    return (
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center lg:pb-18">
        <FeedEmptyState />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center lg:pb-18">
      <div className="flex w-full flex-col px-6 pb-6 md:items-center md:text-center">
        <h1 className="font-sans text-2xl font-bold">Serial</h1>
        <p className="pb-2 font-sans">
          <ClientDatetime />
        </p>
        <div className="flex w-max gap-1 pt-1">
          <ItemVisibilityChips />
        </div>
        <div className="w-max pt-3">
          <ViewFilterChips />
        </div>
      </div>

      <RenderViewItems />
      <MarkVisibleAsReadButton />
    </div>
  );
}
