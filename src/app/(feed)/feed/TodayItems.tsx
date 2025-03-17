"use client";

import dayjs from "dayjs";
import { ClockIcon, SproutIcon, EyeIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { useDialogStore } from "./dialogStore";
import clsx from "clsx";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useFeedsQuery } from "~/lib/data/feeds";
import {
  useFeedItemsQuery,
  useFeedItemsSetWatchedValueMutation,
  useFeedItemsSetWatchLaterValueMutation,
  useFilteredFeedItems,
} from "~/lib/data/feedItems";
import { DatabaseFeedItem } from "~/server/db/schema";
import FeedLoading from "~/app/loading";
import { useContentCategoriesQuery } from "~/lib/data/contentCategories";
import { useFeedCategoriesQuery } from "~/lib/data/feedCategories";

function timeAgo(date: string | Date) {
  const diff = dayjs().diff(date);

  if (diff < 1000 * 60) {
    return "Just now";
  }

  if (diff < 1000 * 60 * 60) {
    return `${Math.floor(diff / (1000 * 60))} minutes ago`;
  }

  if (diff < 1000 * 60 * 60 * 24) {
    return `${Math.floor(diff / (1000 * 60 * 60))} hours ago`;
  }

  return `${Math.floor(diff / (1000 * 60 * 60 * 24))} days ago`;
}

function TodayItemsEmptyState() {
  return (
    <div className="w-full px-6 md:py-6">
      <div className="bg-muted flex w-full flex-col items-center justify-center rounded p-12">
        <SproutIcon size={40} />
        <h2 className="pt-2 text-lg font-semibold">
          You&apos;ve seen everything!
        </h2>
        <p className="max-w-xs pt-1 text-center text-sm opacity-80">
          Take a walk, buy a sweet treat, or do something else that will make
          you happy today.
        </p>
      </div>
    </div>
  );
}

function TodayItemsFeedEmptyState() {
  const launchDialog = useDialogStore((store) => store.launchDialog);

  return (
    <button
      className="w-full px-6 md:py-6"
      onClick={() => launchDialog("add-feed")}
    >
      <div className="bg-muted flex w-full flex-col items-center justify-center rounded p-12">
        <PlusIcon size={40} />
        <h2 className="pt-2 text-lg font-semibold">Add a feed</h2>
        <p className="max-w-xs pt-1 text-center text-sm opacity-80">
          It all starts with a feed! Click here to add one.
        </p>
      </div>
    </button>
  );
}

function ItemDisplay({ item }: { item: DatabaseFeedItem }) {
  const { mutateAsync: setWatchedValue } =
    useFeedItemsSetWatchedValueMutation();
  const { mutateAsync: setWatchLaterValue } =
    useFeedItemsSetWatchLaterValueMutation();

  return (
    <article
      className={clsx(
        "group relative flex w-full flex-1 items-center justify-stretch gap-2 md:h-20",
        {
          "opacity-50": item.isWatched,
        },
      )}
      key={item.contentId}
    >
      <Link
        href={`/feed/watch/${item.contentId}`}
        className="sm:hover:bg-muted flex w-full flex-1 flex-col gap-4 py-4 pr-4 pl-6 text-left transition-colors md:h-20 md:flex-row md:items-center md:rounded md:py-0 md:pr-0"
        prefetch
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.thumbnail}
          alt={item.title}
          className="aspect-video w-16 rounded object-cover"
        />
        <div className="flex h-full flex-1 flex-col justify-center">
          <h3 className="w-full text-xs font-semibold md:text-sm">
            {item.title}
          </h3>
          <p className="w-full text-xs opacity-80 md:text-sm">
            {item.author} • {timeAgo(item.postedAt)}
          </p>
        </div>
      </Link>
      <div className="flex h-full flex-row flex-wrap items-center justify-center pr-6 md:pr-0">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            void setWatchLaterValue({
              contentId: item.contentId,
              feedId: item.feedId!,
              isWatchLater: !item.isWatchLater,
            });
          }}
        >
          <ClockIcon size={16} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            void setWatchedValue({
              contentId: item.contentId,
              feedId: item.feedId!,
              isWatched: !item.isWatched,
            });
          }}
        >
          <EyeIcon size={16} />
        </Button>
      </div>
    </article>
  );
}

export function TodayItems() {
  const { data: feeds, isLoading: isLoadingFeeds } = useFeedsQuery();
  const { data: items, isLoading: isLoadingItems } = useFeedItemsQuery();
  const { data: feedCategories, isLoading: isLoadingFeedCategories } =
    useFeedCategoriesQuery();

  const filteredFeeds = useFilteredFeedItems(items, feedCategories);

  const [parent] = useAutoAnimate();

  if (isLoadingItems || (items?.length === 0 && !!feeds?.length)) {
    return <FeedLoading />;
  }

  if (feeds?.length === 0 || !feeds) {
    return <TodayItemsFeedEmptyState />;
  }

  if (filteredFeeds?.length === 0 || !items) {
    return <TodayItemsEmptyState />;
  }

  return (
    <div className="w-full md:pt-4" ref={parent}>
      {filteredFeeds.map((item) => (
        <ItemDisplay item={item} key={item.contentId} />
      ))}
      <div className="h-16" />
    </div>
  );
}
