"use client";

import { useAutoAnimate } from "@formkit/auto-animate/react";
import clsx from "clsx";
import dayjs from "dayjs";
import {
  CheckIcon,
  ClockIcon,
  EyeIcon,
  PlusIcon,
  RefreshCwIcon,
  SproutIcon,
} from "lucide-react";
import Link from "next/link";
import FeedLoading from "~/app/loading";
import { Button } from "~/components/ui/button";
import {
  useFeedItemGlobalState,
  useFeedItemsMap,
  useFeedItemsOrder,
  useHasFetchedFeedItems,
} from "~/lib/data/atoms";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { useFilteredFeedItemsOrder } from "~/lib/data/feed-items";
import {
  useFeedItemsSetWatchedValueMutation,
  useFeedItemsSetWatchLaterValueMutation,
  useFetchNewFeedItemsMutation,
} from "~/lib/data/feed-items/mutations";
import { useFeeds } from "~/lib/data/feeds";
import { useDialogStore } from "./dialogStore";
import { Suspense } from "react";

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

// function LoaderDisplay() {
//   const hasFetchedFeedItems = useHasFetchedFeedItems();
//   const { hasFetchedFeeds } = useFeeds();
//   const { hasFetchedFeedCategories } = useFeedCategories();

//   if (hasFetchedFeeds && hasFetchedFeedItems && hasFetchedFeedCategories) {
//     return null;
//   }

//   return (
//     <article
//       className={clsx(
//         "group relative mb-6 flex w-full flex-1 items-center justify-center gap-2 rounded px-6",
//       )}
//     >
//       <div className="bg-muted/50 flex w-full flex-1 items-center gap-4 rounded p-6 text-left transition-colors md:justify-center">
//         <RefreshCwIcon className="size-4 animate-spin" />
//         <h3 className="w-fit text-sm font-semibold md:text-sm">
//           Refreshing data...
//         </h3>
//       </div>
//     </article>
//   );
// }

function ItemDisplay({ contentId }: { contentId: string }) {
  const [item] = useFeedItemGlobalState(contentId);

  const { mutateAsync: setWatchedValue } =
    useFeedItemsSetWatchedValueMutation(contentId);
  const { mutateAsync: setWatchLaterValue } =
    useFeedItemsSetWatchLaterValueMutation(contentId);

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
          {item.isWatchLater ? (
            <CheckIcon size={16} />
          ) : (
            <ClockIcon size={16} />
          )}
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
  const { feeds, hasFetchedFeeds } = useFeeds();
  const { feedCategories, hasFetchedFeedCategories } = useFeedCategories();
  const hasFetchedFeedItems = useHasFetchedFeedItems();
  const feedItemsOrder = useFeedItemsOrder();

  const filteredFeedItemsOrder = useFilteredFeedItemsOrder();

  const [parent] = useAutoAnimate();

  if (
    (!hasFetchedFeeds && !feeds) ||
    (!hasFetchedFeedItems && !feedItemsOrder) ||
    (!hasFetchedFeedCategories && !feedCategories)
  ) {
    return <FeedLoading />;
  }

  if (hasFetchedFeeds && !feeds) {
    return <TodayItemsFeedEmptyState />;
  }

  if (
    hasFetchedFeeds &&
    hasFetchedFeedItems &&
    hasFetchedFeedCategories &&
    !filteredFeedItemsOrder
  ) {
    return <TodayItemsEmptyState />;
  }

  return (
    <div className="w-full md:pt-4" ref={parent}>
      {filteredFeedItemsOrder.map((contentId) => (
        <ItemDisplay contentId={contentId} key={contentId} />
      ))}
      <div className="h-16" />
    </div>
  );
}
