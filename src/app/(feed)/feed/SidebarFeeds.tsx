import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { CircleSmall, Edit2Icon, PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import {
  categoryFilterAtom,
  dateFilterAtom,
  feedFilterAtom,
  useFeedItemsMap,
  useFeedItemsOrder,
  viewFilterAtom,
  visibilityFilterAtom,
} from "~/lib/data/atoms";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { doesFeedItemPassFilters } from "~/lib/data/feed-items";
import { useFeeds } from "~/lib/data/feeds";
import { useDialogStore } from "./dialogStore";
import { useDeselectViewFilter } from "~/lib/data/views";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { EditFeedDialog } from "~/components/AddFeedDialog";

function useCheckFilteredFeedItemsForFeed() {
  const feedItemsOrder = useFeedItemsOrder();
  const feedItemsMap = useFeedItemsMap();
  const { feedCategories } = useFeedCategories();
  const { feeds } = useFeeds();

  const dateFilter = useAtomValue(dateFilterAtom);
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const viewFilter = useAtomValue(viewFilterAtom);

  return useCallback(
    (feed: number) => {
      if (!feedItemsOrder || !feedCategories) return [];
      return feedItemsOrder.filter(
        (item) =>
          feedItemsMap[item] &&
          doesFeedItemPassFilters(
            feedItemsMap[item],
            dateFilter,
            visibilityFilter,
            categoryFilter,
            feedCategories,
            feed,
            feeds,
            viewFilter,
          ),
      );
    },
    [
      feedItemsOrder,
      feedItemsMap,
      dateFilter,
      visibilityFilter,
      categoryFilter,
      feedCategories,
      feeds,
    ],
  );
}

export function SidebarFeeds() {
  const [selectedFeedForEditing, setSelectedFeedForEditing] = useState<
    null | number
  >(null);

  const { feeds } = useFeeds();
  const launchDialog = useDialogStore((store) => store.launchDialog);

  const setDateFilter = useSetAtom(dateFilterAtom);
  const [feedFilter, setFeedFilter] = useAtom(feedFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const viewFilter = useAtomValue(viewFilterAtom);
  const deselectViewFilter = useDeselectViewFilter();

  const checkFilteredFeedItemsForFeed = useCheckFilteredFeedItemsForFeed();

  const feedOptions = feeds
    ?.toSorted((a, b) => a.name.localeCompare(b.name))
    ?.map((category) => ({
      ...category,
      hasEntries: !!checkFilteredFeedItemsForFeed(category.id).length,
    }))
    ?.toSorted((a, b) => {
      if (a.hasEntries && !b.hasEntries) return -1;
      if (!a.hasEntries && b.hasEntries) return 1;
      return 0;
    });

  const hasAnyItems = !!checkFilteredFeedItemsForFeed(-1).length;

  return (
    <>
      <EditFeedDialog
        selectedFeedId={selectedFeedForEditing}
        onClose={() => setSelectedFeedForEditing(null)}
      />
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="pr-0 pb-2">
          <span className="inline-block flex-1">Feeds</span>
          <div className="flex w-fit items-center justify-end">
            <SidebarMenuButton asChild onClick={() => launchDialog("add-feed")}>
              <ButtonWithShortcut shortcut="a" variant="ghost">
                <PlusIcon />
              </ButtonWithShortcut>
            </SidebarMenuButton>
          </div>
        </SidebarGroupLabel>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              variant={feedFilter === -1 ? "outline" : "default"}
              onClick={() => {
                setFeedFilter(-1);
                if (!viewFilter && categoryFilter < 0) {
                  setDateFilter(1);
                }
              }}
            >
              {!hasAnyItems && (
                <CircleSmall size={16} className="text-sidebar-accent" />
              )}
              {hasAnyItems && (
                <div className="grid size-4 place-items-center">
                  <div className="bg-sidebar-accent size-2.5 rounded-full" />
                </div>
              )}
              All
            </SidebarMenuButton>
          </SidebarMenuItem>
          {feedOptions.map((feed, i) => {
            return (
              <SidebarMenuItem key={feed.id} className="group flex gap-1">
                <SidebarMenuButton
                  variant={feed.id === feedFilter ? "outline" : "default"}
                  onClick={() => {
                    setFeedFilter(feed.id);
                    setDateFilter(30);
                    if (!feed.hasEntries) {
                      deselectViewFilter();
                    }
                  }}
                >
                  {!feed.hasEntries && (
                    <CircleSmall size={16} className="text-sidebar-accent" />
                  )}
                  {feed.hasEntries && (
                    <div className="grid size-4 place-items-center">
                      <div className="bg-sidebar-accent size-2.5 rounded-full" />
                    </div>
                  )}
                  <div className="line-clamp-1">{feed.name}</div>
                </SidebarMenuButton>
                <div className="group/button flex w-fit items-center justify-end">
                  <SidebarMenuButton
                    onClick={() => setSelectedFeedForEditing(feed.id)}
                  >
                    <Edit2Icon className="opacity-30 transition-opacity group-hover/button:opacity-100" />
                  </SidebarMenuButton>
                </div>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}
