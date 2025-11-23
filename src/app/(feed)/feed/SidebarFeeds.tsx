import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { CircleSmall, Edit2Icon, PlusIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { EditFeedDialog } from "~/components/AddFeedDialog";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { Input } from "~/components/ui/input";
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
  viewFilterAtom,
  visibilityFilterAtom,
} from "~/lib/data/atoms";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { doesFeedItemPassFilters } from "~/lib/data/feed-items";
import { useFeeds } from "~/lib/data/feeds";
import { useDeselectViewFilter } from "~/lib/data/views";
import { useDialogStore } from "./dialogStore";
import { useFeedItemsDict, useFeedItemsOrder } from "~/lib/data/store";

function useCheckFilteredFeedItemsForFeed() {
  const feedItemsOrder = useFeedItemsOrder();
  const feedItemsDict = useFeedItemsDict();
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
          feedItemsDict[item] &&
          doesFeedItemPassFilters(
            feedItemsDict[item],
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
      feedItemsDict,
      dateFilter,
      visibilityFilter,
      categoryFilter,
      feedCategories,
      feeds,
      viewFilter,
    ],
  );
}

function useDebouncedState(defaultValue: string, delay: number) {
  const [searchQuery, setSearchQuery] = useState(defaultValue);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setDebouncedQuery = useCallback(
    (newValue: string, forceUpdate = false) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      if (forceUpdate) {
        setSearchQuery(newValue);
      } else {
        timeoutRef.current = setTimeout(() => {
          setSearchQuery(newValue);
        }, delay);
      }
    },
    [delay],
  );

  return [searchQuery, setDebouncedQuery] as const;
}

export function SidebarFeeds() {
  const [searchQuery, setSearchQuery] = useDebouncedState("", 300);

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

  const feedOptions = feeds?.map((category) => ({
    ...category,
    hasEntries: !!checkFilteredFeedItemsForFeed(category.id).length,
  }));

  const preferredFeedOptions = feedOptions
    ?.filter((feedOption) => {
      if (!!searchQuery) {
        const lowercaseQuery = searchQuery.toLowerCase();
        const lowercaseName = feedOption.name.toLowerCase();

        if (lowercaseName.includes(lowercaseQuery)) {
          return true;
        }
      } else {
        if (feedOption.hasEntries) return true;
      }

      if (feedOption.id === feedFilter) {
        return true;
      }

      return false;
    })
    .toSorted((a, b) => {
      if (a.id === feedFilter) {
        return -1;
      }
      if (b.id === feedFilter) {
        return 1;
      }

      return a.name.localeCompare(b.name);
    });

  const otherFeedOptions = feedOptions
    ?.filter((feedOption) => {
      return !preferredFeedOptions.some(
        (option) => option.id === feedOption.id,
      );
    })
    .toSorted((a, b) => {
      return a.name.localeCompare(b.name);
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
          <SidebarMenuItem className="my-2">
            <Input
              placeholder="Search for feed"
              onBlur={(e) => {
                setSearchQuery(e.target.value, true);
              }}
              onChange={(e) => {
                setSearchQuery(e.target.value);
              }}
            />
          </SidebarMenuItem>
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
          {preferredFeedOptions.map((feed) => {
            return (
              <SidebarMenuItem key={feed.id} className="group flex gap-1">
                <SidebarMenuButton
                  variant={feed.id === feedFilter ? "outline" : "default"}
                  onClick={() => {
                    setFeedFilter(feed.id);
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
          {!!preferredFeedOptions.length && !!otherFeedOptions.length && (
            <hr className="my-2 opacity-50" />
          )}
          {otherFeedOptions.map((feed) => {
            return (
              <SidebarMenuItem key={feed.id} className="group flex gap-1">
                <SidebarMenuButton
                  variant={feed.id === feedFilter ? "outline" : "default"}
                  onClick={() => {
                    setFeedFilter(feed.id);
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
