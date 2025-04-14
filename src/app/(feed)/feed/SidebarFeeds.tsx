import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { CircleSmall, PlusIcon } from "lucide-react";
import { useCallback } from "react";
import { Button } from "~/components/ui/button";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import {
  categoryFilterAtom,
  dateFilterAtom,
  feedFilterAtom,
  useFeedItemsMap,
  useFeedItemsOrder,
  visibilityFilterAtom,
} from "~/lib/data/atoms";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { doesFeedItemPassFilters } from "~/lib/data/feed-items";
import { useFeeds } from "~/lib/data/feeds";

function useCheckFilteredFeedItemsForFeed() {
  const feedItemsOrder = useFeedItemsOrder();
  const feedItemsMap = useFeedItemsMap();
  const { feedCategories } = useFeedCategories();
  const { feeds } = useFeeds();

  const dateFilter = useAtomValue(dateFilterAtom);
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);

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
  const { feeds } = useFeeds();

  const [feedFilter, setFeedFilter] = useAtom(feedFilterAtom);

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
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Feeds</SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            variant={feedFilter === -1 ? "outline" : "default"}
            onClick={() => setFeedFilter(-1)}
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
            <SidebarMenuItem key={feed.id}>
              <SidebarMenuButton
                variant={feed.id === feedFilter ? "outline" : "default"}
                onClick={() => setFeedFilter(feed.id)}
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
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
