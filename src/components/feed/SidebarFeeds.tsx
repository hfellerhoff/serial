import { Link } from "@tanstack/react-router";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  AlertCircleIcon,
  CircleSmall,
  Edit2Icon,
  MinusIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Skeleton } from "../ui/skeleton";
import { useDialogStore } from "./dialogStore";
import type { ApplicationFeed } from "~/server/db/schema";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
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
import {
  useFeedItemsDict,
  useFeedItemsOrder,
  useFeedStatusDict,
  useFetchFeedItemsLastFetchedAt,
  useFetchFeedItemsStatus,
} from "~/lib/data/store";
import { useDeselectViewFilter } from "~/lib/data/views";

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

function sortFeedOptions(a: ApplicationFeed, b: ApplicationFeed) {
  return a.name.localeCompare(b.name);
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

  const feedStatusDict = useFeedStatusDict();
  const fetchFeedItemsStatus = useFetchFeedItemsStatus();
  const fetchFeedItemsLastFetchedAt = useFetchFeedItemsLastFetchedAt();

  const checkFilteredFeedItemsForFeed = useCheckFilteredFeedItemsForFeed();

  if (fetchFeedItemsStatus === "fetching" && !fetchFeedItemsLastFetchedAt) {
    return (
      <div>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel className="pr-0 pb-2">
            <span className="inline-block flex-1">Feeds</span>
            <div className="flex w-fit items-center justify-end">
              <SidebarMenuButton asChild>
                <Link to="/feeds">
                  <SettingsIcon size={16} />
                </Link>
              </SidebarMenuButton>
              <SidebarMenuButton
                asChild
                onClick={() => launchDialog("add-feed")}
              >
                <ButtonWithShortcut shortcut="a" variant="ghost">
                  <PlusIcon />
                </ButtonWithShortcut>
              </SidebarMenuButton>
            </div>
          </SidebarGroupLabel>
          <div className="flex flex-col items-center gap-4 px-2 py-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </SidebarGroup>
      </div>
    );
  }

  const feedOptions = feeds.map((feed) => ({
    ...feed,
    hasEntries: !!checkFilteredFeedItemsForFeed(feed.id).length,
  }));

  const {
    preferredFeedOptions,
    feedOptionsWithContent,
    emptyFeedOptions,
    errorFeedOptions,
  } = feedOptions.reduce(
    (acc, feedOption) => {
      if (searchQuery) {
        const lowercaseQuery = searchQuery.toLowerCase();
        const lowercaseName = feedOption.name.toLowerCase();

        if (lowercaseName.includes(lowercaseQuery)) {
          acc.preferredFeedOptions.push(feedOption);
          acc.preferredFeedOptions.sort(sortFeedOptions);
          return acc;
        }
      } else {
        if (feedOption.hasEntries) {
          acc.preferredFeedOptions.push(feedOption);
          acc.preferredFeedOptions.sort(sortFeedOptions);
          return acc;
        }
      }

      if (feedOption.id === feedFilter) {
        acc.preferredFeedOptions.push(feedOption);
        acc.preferredFeedOptions.sort(sortFeedOptions);
        return acc;
      }

      const feedStatus = feedStatusDict[feedOption.id]
        ? feedStatusDict[feedOption.id]
        : fetchFeedItemsStatus === "fetching"
          ? "success"
          : "empty";

      if (feedStatus === "success") {
        acc.feedOptionsWithContent.push(feedOption);
        acc.feedOptionsWithContent.sort(sortFeedOptions);
      } else if (feedStatus === "empty") {
        acc.emptyFeedOptions.push(feedOption);
        acc.emptyFeedOptions.sort(sortFeedOptions);
      } else if (feedStatus === "error") {
        acc.errorFeedOptions.push(feedOption);
        acc.errorFeedOptions.sort(sortFeedOptions);
      }

      return acc;
    },
    {
      preferredFeedOptions: [] as typeof feedOptions,
      feedOptionsWithContent: [] as typeof feedOptions,
      emptyFeedOptions: [] as typeof feedOptions,
      errorFeedOptions: [] as typeof feedOptions,
    },
  );

  const hasAnyItems = !!checkFilteredFeedItemsForFeed(-1).length;

  return (
    <>
      <EditFeedDialog
        selectedFeedId={selectedFeedForEditing}
        onClose={() => setSelectedFeedForEditing(null)}
      />
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="pr-0 pb-2">
          <span className="inline-block">Feeds</span>
          <div className="flex flex-1 items-center justify-end">
            <SidebarMenuButton size="default-icon" asChild>
              <Link to="/feeds">
                <SettingsIcon size={16} />
              </Link>
            </SidebarMenuButton>
            <SidebarMenuButton
              size="default-icon"
              asChild
              onClick={() => launchDialog("add-feed")}
            >
              <PlusIcon />
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
            const feedStatus = feedStatusDict[feed.id]
              ? feedStatusDict[feed.id]
              : fetchFeedItemsStatus === "fetching"
                ? "success"
                : "empty";

            const isSuccess = feedStatus === "success";

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
                  {feedStatus === "error" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertCircleIcon
                          size={16}
                          className="text-sidebar-accent"
                        />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-center">
                        Something went wrong fetching content for this feed. If
                        this continues, try deleting this feed and adding it
                        again with the correct URL.
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {feedStatus === "empty" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <MinusIcon size={16} className="text-sidebar-accent" />
                      </TooltipTrigger>
                      <TooltipContent>
                        This feed has no new content within the last 30 days.
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {isSuccess && !feed.hasEntries && (
                    <CircleSmall size={16} className="text-sidebar-accent" />
                  )}
                  {isSuccess && feed.hasEntries && (
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
          {!!preferredFeedOptions.length && !!feedOptionsWithContent.length && (
            <hr className="my-2 opacity-50" />
          )}
          {feedOptionsWithContent.map((feed) => {
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
          {!!feedOptionsWithContent.length && !!emptyFeedOptions.length && (
            <hr className="my-2 opacity-50" />
          )}
          {emptyFeedOptions.map((feed) => {
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <MinusIcon size={16} className="text-sidebar-accent" />
                    </TooltipTrigger>
                    <TooltipContent>
                      This feed has no new content within the last 30 days.
                    </TooltipContent>
                  </Tooltip>
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
          {!!emptyFeedOptions.length && !!errorFeedOptions.length && (
            <hr className="my-2 opacity-50" />
          )}
          {errorFeedOptions.map((feed) => {
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertCircleIcon
                        size={16}
                        className="text-sidebar-accent"
                      />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-center">
                      Something went wrong fetching content for this feed. If
                      this continues, try deleting this feed and adding it again
                      with the correct URL.
                    </TooltipContent>
                  </Tooltip>

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
