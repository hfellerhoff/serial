"use client";

import { useAutoAnimate } from "@formkit/auto-animate/react";
import clsx from "clsx";
import dayjs from "dayjs";
import {
  CheckIcon,
  ClockIcon,
  EyeIcon,
  ImportIcon,
  PlusIcon,
  RefreshCwIcon,
  SproutIcon,
} from "lucide-react";
import Link from "next/link";
import FeedLoading from "~/app/loading";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  useFeedItemGlobalState,
  useHasFetchedFeedItems,
} from "~/lib/data/atoms";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { useFilteredFeedItemsOrder } from "~/lib/data/feed-items";
import {
  useFeedItemsSetWatchedValueMutation,
  useFeedItemsSetWatchLaterValueMutation,
} from "~/lib/data/feed-items/mutations";
import { useFeeds } from "~/lib/data/feeds";
import { useViews } from "~/lib/data/views";
import { useDialogStore } from "./dialogStore";

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
    <>
      <div className="w-full px-6 pt-6 pb-4 md:pt-16 md:text-center">
        <h2 className="font-mono text-xl font-bold">Welcome to Serial!</h2>
        <p className="">There are a couple ways to get started:</p>
      </div>
      <div className="flex w-full flex-col gap-4 px-6 md:flex-row">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Add feeds manually</CardTitle>
            <CardDescription>
              Add one or more feeds by
              <ul className="list-disc pl-4">
                <li>YouTube Channel URL</li>
                <li>RSS Feed URL</li>
              </ul>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex h-full flex-col justify-end">
            <Button onClick={() => launchDialog("add-feed")}>
              <PlusIcon size={16} />
              <span className="pl-1.5">Add Feed</span>
            </Button>
          </CardContent>
        </Card>
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Import feeds from elsewhere</CardTitle>
            <CardDescription>
              Serial supports importing from
              <ul className="list-disc pl-4">
                <li>
                  Google Takeout (<code>subscriptions.csv</code>)
                </li>
                <li>
                  Other RSS readers (<code>.opml</code>)
                </li>
              </ul>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex h-full flex-col justify-end">
            <Button asChild>
              <Link href="/feed/import">
                <ImportIcon size={16} />
                <span className="pl-1.5">Import Feeds</span>
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function LoaderDisplay() {
  const hasFetchedFeedItems = useHasFetchedFeedItems();
  const { hasFetchedFeeds } = useFeeds();
  const { hasFetchedFeedCategories } = useFeedCategories();

  if (hasFetchedFeeds && hasFetchedFeedItems && hasFetchedFeedCategories) {
    return null;
  }

  return (
    <article
      className={clsx(
        "group relative mb-6 flex w-full flex-1 items-center justify-center gap-2 rounded px-6",
      )}
    >
      <div className="bg-muted/50 flex w-full flex-1 items-center gap-4 rounded p-6 text-left transition-colors md:justify-center">
        <RefreshCwIcon className="size-4 animate-spin" />
        <h3 className="w-fit text-sm font-semibold md:text-sm">
          Fetching data...
        </h3>
      </div>
    </article>
  );
}

function ItemDisplay({ contentId }: { contentId: string }) {
  const { feeds } = useFeeds();
  const [item] = useFeedItemGlobalState(contentId);

  const { mutateAsync: setWatchedValue } =
    useFeedItemsSetWatchedValueMutation(contentId);
  const { mutateAsync: setWatchLaterValue } =
    useFeedItemsSetWatchLaterValueMutation(contentId);

  const feed = feeds.find((f) => f.id === item.feedId);

  const itemDestination = item.platform === "website" ? "read" : "watch";

  const shouldOpenInSerial = feed?.openLocation === "serial";

  const href = shouldOpenInSerial
    ? `/feed/${itemDestination}/${item.id}`
    : item.url;

  const target = shouldOpenInSerial ? undefined : "_blank";
  const rel = shouldOpenInSerial ? undefined : "noopener noreferrer";

  return (
    <article
      className={clsx(
        "group relative flex w-full flex-1 items-center justify-stretch gap-2 md:h-20",
        {
          "opacity-50": item.isWatched,
        },
      )}
    >
      <Link
        href={href}
        target={target}
        rel={rel}
        className="sm:hover:bg-muted flex w-full flex-1 flex-col gap-4 py-4 pr-4 pl-6 text-left transition-colors md:h-20 md:flex-row md:items-center md:rounded md:py-0 md:pr-0"
        prefetch
      >
        {!!item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt={item.title}
            className="aspect-video w-16 rounded object-cover"
          />
        ) : !!feed?.imageUrl ? (
          <div className="grid aspect-video w-16 place-items-center rounded object-cover">
            <img
              src={feed.imageUrl}
              alt={item.title}
              className="aspect-square h-9 rounded object-cover"
            />
          </div>
        ) : (
          <div className="grid aspect-video w-16 place-items-center rounded object-cover">
            <div className="bg-muted aspect-square h-9 rounded object-cover" />
          </div>
        )}
        <div className="flex h-full flex-1 flex-col justify-center">
          <h3 className="line-clamp-1 w-full text-xs font-semibold md:text-sm">
            {item.title}
          </h3>
          <p className="w-full text-xs opacity-80 md:text-sm">
            {item.author || feed?.name} • {timeAgo(item.postedAt)}
          </p>
        </div>
      </Link>
      <div className="flex h-full flex-row flex-wrap items-center justify-center pr-6 md:pr-0">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            void setWatchLaterValue({
              id: item.id,
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
              id: item.id,
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
  const { hasFetchedFeedCategories } = useFeedCategories();
  const { views } = useViews();
  const hasFetchedFeedItems = useHasFetchedFeedItems();

  const filteredFeedItemsOrder = useFilteredFeedItemsOrder();

  const [parent] = useAutoAnimate();

  if (!views.length) {
    return <FeedLoading />;
  }

  if (hasFetchedFeeds && !feeds.length) {
    return <TodayItemsFeedEmptyState />;
  }

  if (
    hasFetchedFeeds &&
    hasFetchedFeedItems &&
    hasFetchedFeedCategories &&
    !filteredFeedItemsOrder.length
  ) {
    return <TodayItemsEmptyState />;
  }

  return (
    <div className="w-full transition-all md:pt-4 md:pr-6 md:pl-4" ref={parent}>
      <LoaderDisplay />
      {filteredFeedItemsOrder.map((contentId) => (
        <ItemDisplay contentId={contentId} key={contentId} />
      ))}
    </div>
  );
}
