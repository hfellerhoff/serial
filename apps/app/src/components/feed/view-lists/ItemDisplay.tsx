"use client";

import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { useAtomValue } from "jotai";
import {
  ArchiveIcon,
  BookmarkCheckIcon,
  BookmarkIcon,
  PencilIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react";
import { getBookmarkAddedAt } from "./itemDate";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import type { ConnectionState } from "~/lib/data/atoms";
import { KeyboardShortcutDisplay } from "~/components/ButtonWithShortcut";
import { Button } from "~/components/ui/button";
import { useFeedItemsSetWatchLaterValueMutation } from "~/lib/data/feed-items/mutations";
import { useFeeds as useFeedsArray } from "~/lib/data/feeds/store";
import {
  useSaveToInstapaperMutation,
  useShowInstapaperAction,
} from "~/lib/data/instapaper";
import { useFeedItemValue, useHasRetainedFeedItemBody } from "~/lib/data/store";
import { timeAgo } from "~/lib/utils";
import { SHORTCUT_KEYS } from "~/lib/constants/shortcuts";
import { useFeedItemActions } from "~/lib/hooks/useFeedItemActions";
import { useShowShortcuts } from "~/lib/hooks/useShowShortcuts";
import { captureRootScrollRestoration } from "~/lib/root-scroll-restoration";
import { useBookmarkValue } from "~/lib/data/bookmarks";
import {
  useDeleteBookmarkMutation,
  useUpdateBookmarkStateMutation,
} from "~/lib/data/bookmarks/mutations";
import { useDialogStore } from "~/components/feed/dialogStore";
import { contentDestination } from "~/lib/data/content-items/resolver";
import { REMOTE_IMAGE_PROPS } from "~/lib/remoteMedia";
import { connectionStateAtom } from "~/lib/data/atoms";
import {
  canOpenContent,
  hasRetainedFeedBody,
} from "~/lib/data/offline-content";
import { useCanMutate } from "~/lib/data/offline-mutations";
import { useBookmarkCaptureValue } from "~/lib/data/bookmarks/capture-store";

export type ItemSize = "standard" | "large";

// Typography components for consistent styling across layouts

interface ItemTitleProps {
  title: string;
  lineClamp?: 1 | 2;
}

function ItemTitle({ title, lineClamp = 2 }: ItemTitleProps) {
  return (
    <h3
      className={clsx(
        "w-full text-xs font-semibold md:text-sm",
        lineClamp === 1 ? "line-clamp-1" : "line-clamp-2",
      )}
    >
      {title}
    </h3>
  );
}

interface ItemContentSnippetProps {
  snippet: string | undefined;
}

function ItemContentSnippet({ snippet }: ItemContentSnippetProps) {
  if (!snippet) return null;

  return (
    <p className="line-clamp-2 w-full pt-1 text-xs opacity-60 md:text-sm">
      {snippet.slice(0, 150)}
    </p>
  );
}

interface ItemMetaProps {
  author: string | undefined;
  feedName: string | undefined;
  postedAt: Date;
  className?: string;
}

export function ItemMeta({
  author,
  feedName,
  postedAt,
  className,
}: ItemMetaProps) {
  const metadataParts = [author || feedName, timeAgo(postedAt)].filter(Boolean);

  return (
    <p
      className={clsx(
        "line-clamp-1 w-full text-xs opacity-80 md:text-sm",
        className,
      )}
    >
      {metadataParts.join(" • ")}
    </p>
  );
}

// Thumbnail components for consistent styling across layouts

type ThumbnailType =
  "horizontal-video" | "vertical-video" | "article" | "icon" | "none";

function getThumbnailType(
  item: {
    thumbnail?: string;
    platform: string;
    orientation?: string | null;
  },
  feed?: { imageUrl?: string },
  layout?: ThumbnailLayout,
  hideFeedIcon?: boolean,
): ThumbnailType {
  if (item.thumbnail) {
    // Standard list uses icon style for non-video content
    if (item.platform === "website") {
      return layout === "list"
        ? feed?.imageUrl && !hideFeedIcon
          ? "icon"
          : "none"
        : "article";
    }
    if (item.orientation === "vertical") return "vertical-video";
    return "horizontal-video";
  }
  if (feed?.imageUrl && !hideFeedIcon) return "icon";
  return "none";
}

export type ThumbnailLayout = "list" | "large-list" | "grid" | "large-grid";

interface ThumbnailContainerProps {
  layout: ThumbnailLayout;
  thumbnailType: ThumbnailType;
  children: React.ReactNode;
  progress?: number;
  duration?: number;
}

function ThumbnailContainer({
  layout,
  thumbnailType,
  children,
  progress,
  duration,
}: ThumbnailContainerProps) {
  const isVideo =
    thumbnailType === "horizontal-video" || thumbnailType === "vertical-video";

  const percentage =
    progress && duration && duration > 0
      ? Math.min((progress / duration) * 100, 100)
      : 0;

  return (
    <div
      className={clsx("relative flex-shrink-0 overflow-hidden rounded", {
        // List layout: videos use natural aspect ratio, others use square
        "h-9 w-16": layout === "list" && thumbnailType === "horizontal-video",
        "h-16 w-9": layout === "list" && thumbnailType === "vertical-video",
        "size-16":
          layout === "list" &&
          (thumbnailType === "icon" || thumbnailType === "none"),
        // Large list layout
        "aspect-video w-44":
          layout === "large-list" && thumbnailType === "horizontal-video",
        "aspect-[9/16] w-20":
          layout === "large-list" && thumbnailType === "vertical-video",
        "bg-muted aspect-[3/2] w-44": layout === "large-list" && !isVideo,
        // Grid layout (standard)
        "aspect-video w-full":
          (layout === "grid" || layout === "large-grid") &&
          thumbnailType === "horizontal-video",
        "aspect-[9/16] w-full":
          (layout === "grid" || layout === "large-grid") &&
          thumbnailType === "vertical-video",
        // Non-video grid layouts
        "bg-muted aspect-[3/2] w-full":
          (layout === "grid" || layout === "large-grid") && !isVideo,
      })}
    >
      {children}
      {percentage > 0 && (
        <div className="absolute inset-x-0 bottom-0 z-10 h-1.5 bg-white/30">
          <div
            className="bg-muted-foreground h-full"
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}

interface ThumbnailProps {
  thumbnail: string;
  title: string;
}

function VideoThumbnail({ thumbnail, title }: ThumbnailProps) {
  return (
    <img
      {...REMOTE_IMAGE_PROPS}
      src={thumbnail}
      alt={title}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

function ShortsThumbnail({ thumbnail, title }: ThumbnailProps) {
  return (
    <img
      {...REMOTE_IMAGE_PROPS}
      src={thumbnail}
      alt={title}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

interface ArticleThumbnailProps {
  thumbnail: string;
  title: string;
  feedImageUrl?: string;
  feedName?: string;
  hideFeedIcon?: boolean;
}

function ArticleThumbnail({
  thumbnail,
  title,
  feedImageUrl,
  feedName,
  hideFeedIcon,
}: ArticleThumbnailProps) {
  return (
    <>
      <img
        {...REMOTE_IMAGE_PROPS}
        src={thumbnail}
        alt={title}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="bg-foreground/30 dark:bg-background/30 absolute inset-0" />
      {feedImageUrl && !hideFeedIcon && (
        <img
          {...REMOTE_IMAGE_PROPS}
          src={feedImageUrl}
          alt={feedName}
          className="bg-background dark:bg-foreground absolute top-2 left-2 z-10 h-10 w-10 rounded object-contain p-1 shadow-md"
        />
      )}
    </>
  );
}

interface IconThumbnailProps {
  feedImageUrl: string;
  feedName?: string;
}

function IconThumbnail({ feedImageUrl, feedName }: IconThumbnailProps) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <img
        {...REMOTE_IMAGE_PROPS}
        src={feedImageUrl}
        alt={feedName}
        className="h-10 w-10 rounded object-contain"
      />
    </div>
  );
}

function EmptyThumbnail() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-transparent">
      <div
        data-testid="empty-thumbnail-placeholder"
        className="bg-muted-foreground/20 h-10 w-10 rounded"
      />
    </div>
  );
}

type ItemActionsLayout = "list" | "large-list" | "grid";

interface ItemActionsProps {
  contentId: string;
  item: {
    id: string;
    feedId: number;
    platform: string;
    isWatchLater: boolean;
    isWatched: boolean;
  };
  layout: ItemActionsLayout;
  isSelected?: boolean;
}

function ItemActions({
  contentId,
  item,
  layout,
  isSelected,
}: ItemActionsProps) {
  const { mutateAsync: setWatchLaterValue } =
    useFeedItemsSetWatchLaterValueMutation(contentId);
  const { toggleRead } = useFeedItemActions(contentId);

  const showInstapaperAction = useShowInstapaperAction(contentId);
  const { mutateAsync: saveToInstapaper, isPending: isSavingToInstapaper } =
    useSaveToInstapaperMutation(contentId);

  const showShortcuts = useShowShortcuts();
  const canMutate = useCanMutate();

  const isStandardList = layout === "list";
  const isLargeList = layout === "large-list";
  const isGrid = layout === "grid";

  const handleSaveToInstapaper = () => {
    void saveToInstapaper({ feedItemId: item.id });
  };

  const handleToggleWatchLater = () => {
    void setWatchLaterValue({
      id: item.id,
      feedId: item.feedId,
      isWatchLater: !item.isWatchLater,
    });
  };

  const handleToggleWatched = () => {
    toggleRead();
  };

  return (
    <div
      className={clsx(
        "md:bg-background/90 flex flex-row items-center md:absolute md:right-2 md:bottom-2 md:rounded-lg md:shadow-sm",
        {
          "md:hidden md:group-hover:flex": !(showShortcuts && isSelected),
          "-ml-2 justify-start px-6 pb-2 md:right-2 md:bottom-5 md:ml-0 md:px-0 md:pb-0":
            isStandardList,
          "-ml-2 justify-start gap-1 px-2 pb-2 md:ml-0 md:px-0 md:pb-0": isGrid,
          "-ml-2 justify-start px-6 pb-2 md:right-2 md:bottom-2 md:ml-0 md:px-0 md:pb-0":
            isLargeList,
        },
      )}
    >
      {showInstapaperAction && (
        <Button
          size={isGrid ? "icon" : "icon"}
          variant="ghost"
          disabled={!canMutate || isSavingToInstapaper}
          onClick={handleSaveToInstapaper}
          className={clsx("relative overflow-visible", {
            "h-8 w-8 p-0": isGrid,
          })}
        >
          <SendIcon size={isGrid ? 14 : 16} />
          <KeyboardShortcutDisplay
            shortcut={SHORTCUT_KEYS.SEND_TO_INSTAPAPER}
          />
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        disabled={!canMutate}
        onClick={handleToggleWatchLater}
        className={clsx("relative overflow-visible", {
          "h-8 w-8 p-0": isGrid,
        })}
      >
        {item.isWatchLater ? (
          <BookmarkCheckIcon size={isGrid ? 14 : 16} />
        ) : (
          <BookmarkIcon size={isGrid ? 14 : 16} />
        )}
        <KeyboardShortcutDisplay shortcut={SHORTCUT_KEYS.TOGGLE_SAVED} />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        disabled={!canMutate}
        onClick={handleToggleWatched}
        className={clsx("relative overflow-visible", {
          "h-8 w-8 p-0": isGrid,
        })}
      >
        <ArchiveIcon size={isGrid ? 14 : 16} />
        <KeyboardShortcutDisplay shortcut={SHORTCUT_KEYS.TOGGLE_READ} />
      </Button>
    </div>
  );
}

interface ItemThumbnailProps {
  layout: ThumbnailLayout;
  item: {
    thumbnail?: string;
    title: string;
    platform: string;
    orientation?: string | null;
    progress?: number;
    duration?: number;
  };
  feed?: {
    imageUrl?: string;
    name?: string;
  };
  hideFeedIcon?: boolean;
}

function ItemThumbnail({
  layout,
  item,
  feed,
  hideFeedIcon,
}: ItemThumbnailProps) {
  const thumbnailType = getThumbnailType(item, feed, layout, hideFeedIcon);

  return (
    <ThumbnailContainer
      layout={layout}
      thumbnailType={thumbnailType}
      progress={item.progress}
      duration={item.duration}
    >
      {thumbnailType === "horizontal-video" && item.thumbnail && (
        <VideoThumbnail thumbnail={item.thumbnail} title={item.title} />
      )}
      {thumbnailType === "vertical-video" && item.thumbnail && (
        <ShortsThumbnail thumbnail={item.thumbnail} title={item.title} />
      )}
      {thumbnailType === "article" && item.thumbnail && (
        <ArticleThumbnail
          thumbnail={item.thumbnail}
          title={item.title}
          feedImageUrl={feed?.imageUrl}
          feedName={feed?.name}
          hideFeedIcon={hideFeedIcon}
        />
      )}
      {thumbnailType === "icon" && feed?.imageUrl && (
        <IconThumbnail feedImageUrl={feed.imageUrl} feedName={feed.name} />
      )}
      {thumbnailType === "none" && <EmptyThumbnail />}
    </ThumbnailContainer>
  );
}

export function BookmarkThumbnail({
  bookmark,
  layout,
}: {
  bookmark: Pick<
    ApplicationBookmark,
    | "duration"
    | "iconUrl"
    | "orientation"
    | "platform"
    | "progress"
    | "siteName"
    | "thumbnailUrl"
    | "title"
  >;
  layout: ThumbnailLayout;
}) {
  return (
    <ItemThumbnail
      layout={layout}
      item={{
        ...(bookmark.thumbnailUrl ? { thumbnail: bookmark.thumbnailUrl } : {}),
        title: bookmark.title,
        platform: bookmark.platform,
        orientation: bookmark.orientation,
        progress: bookmark.progress,
        duration: bookmark.duration,
      }}
      feed={
        bookmark.iconUrl
          ? {
              imageUrl: bookmark.iconUrl,
              name: bookmark.siteName ?? undefined,
            }
          : undefined
      }
    />
  );
}

function BookmarkActions({
  bookmark,
  layout,
  isSelected,
}: {
  bookmark: ApplicationBookmark;
  layout: ItemActionsLayout;
  isSelected?: boolean;
}) {
  const { mutate: updateState } = useUpdateBookmarkStateMutation(bookmark.id);
  const { mutate: deleteBookmark } = useDeleteBookmarkMutation();
  const launchDialog = useDialogStore((store) => store.launchDialog);
  const showShortcuts = useShowShortcuts();
  const canMutate = useCanMutate();
  const isGrid = layout === "grid";
  const isStandardList = layout === "list";

  return (
    <div
      className={clsx(
        "md:bg-background/90 flex flex-row items-center md:absolute md:right-2 md:bottom-2 md:rounded-lg md:shadow-sm",
        {
          "md:hidden md:group-hover:flex": !(showShortcuts && isSelected),
          "-ml-2 justify-start px-6 pb-2 md:ml-0 md:px-0 md:pb-0":
            isStandardList,
          "-ml-2 justify-start gap-1 px-2 pb-2 md:ml-0 md:px-0 md:pb-0": isGrid,
        },
      )}
    >
      <Button
        size="icon"
        variant="ghost"
        aria-label="Edit Bookmark"
        disabled={!canMutate}
        className={clsx({ "h-8 w-8 p-0": isGrid })}
        onClick={() =>
          launchDialog("edit-bookmark", { selectedBookmarkId: bookmark.id })
        }
      >
        <PencilIcon size={isGrid ? 14 : 16} />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label={bookmark.isSaved ? "Unsave" : "Save"}
        disabled={!canMutate}
        className={clsx({ "h-8 w-8 p-0": isGrid })}
        onClick={() =>
          updateState({
            bookmarkId: bookmark.id,
            isSaved: !bookmark.isSaved,
          })
        }
      >
        {bookmark.isSaved ? (
          <BookmarkCheckIcon size={isGrid ? 14 : 16} />
        ) : (
          <BookmarkIcon size={isGrid ? 14 : 16} />
        )}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label={bookmark.isRead ? "Unarchive" : "Archive"}
        disabled={!canMutate}
        className={clsx({ "h-8 w-8 p-0": isGrid })}
        onClick={() =>
          updateState({
            bookmarkId: bookmark.id,
            isRead: !bookmark.isRead,
          })
        }
      >
        <ArchiveIcon size={isGrid ? 14 : 16} />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Delete Bookmark"
        disabled={!canMutate}
        className={clsx({ "h-8 w-8 p-0": isGrid })}
        onClick={() => deleteBookmark({ bookmarkId: bookmark.id })}
      >
        <Trash2Icon size={isGrid ? 14 : 16} />
      </Button>
    </div>
  );
}

// Shared offline/open-location link derivation for feed and bookmark rows.

function feedOpensInSerial(feed: { openLocation?: string | null } | undefined) {
  return feed?.openLocation === "serial" || !feed?.openLocation;
}

/**
 * Derives the row link for feed and bookmark items. Offline rows always route
 * to the local reader; online rows open externally in a new tab when the
 * content is not rendered in Serial. `relRequiresTarget` preserves the
 * bookmark behavior of only emitting `rel` alongside an actual `target`,
 * whereas feed rows keep `rel` for external content even while offline.
 */
function deriveItemLink({
  connectionState,
  offlineHref,
  serialHref,
  externalHref,
  opensExternally,
  relRequiresTarget,
}: {
  connectionState: ConnectionState;
  offlineHref: string;
  serialHref: string;
  externalHref: string;
  opensExternally: boolean;
  relRequiresTarget?: boolean;
}) {
  const isOffline = connectionState === "disconnected";
  const opensInNewTab = !isOffline && opensExternally;
  const target = opensInNewTab ? ("_blank" as const) : undefined;
  const rel = (relRequiresTarget ? opensInNewTab : opensExternally)
    ? ("noopener noreferrer" as const)
    : undefined;
  const href = isOffline
    ? offlineHref
    : opensExternally
      ? externalHref
      : serialHref;
  return { isOffline, href, target, rel };
}

function createItemLinkClickHandler({
  canOpen,
  target,
  restorationId,
}: {
  canOpen: boolean;
  target: "_blank" | undefined;
  restorationId: string;
}) {
  return (event: { preventDefault: () => void }) => {
    if (!canOpen) {
      event.preventDefault();
      return;
    }
    if (!target) captureRootScrollRestoration(restorationId);
  };
}

function BookmarkItemDisplay({
  bookmark,
  size,
  isSelected,
  onSelect,
  grid,
}: {
  bookmark: ApplicationBookmark;
  size: ItemSize;
  isSelected?: boolean;
  onSelect?: () => void;
  grid: boolean;
}) {
  const destination = contentDestination({
    entityKind: "bookmark",
    entity: bookmark,
  });
  const connectionState = useAtomValue(connectionStateAtom);
  const capture = useBookmarkCaptureValue(bookmark.id);
  const canOpen = canOpenContent({
    connectionState,
    contentType: bookmark.contentType,
    hasBody: capture !== undefined,
  });
  const { href, target, rel } = deriveItemLink({
    connectionState,
    offlineHref: `/read/${bookmark.id}`,
    serialHref: destination.href,
    externalHref: destination.href,
    opensExternally: destination.external,
    relRequiresTarget: true,
  });
  const handleLinkClick = createItemLinkClickHandler({
    canOpen,
    target,
    restorationId: bookmark.id,
  });
  const layoutProps: BookmarkLayoutProps = {
    bookmark,
    isLarge: size === "large",
    isSelected,
    onSelect,
    canOpen,
    href,
    target,
    rel,
    onLinkClick: handleLinkClick,
    feedName: bookmark.siteName ?? new URL(bookmark.sourceUrl).hostname,
    postedAt: getBookmarkAddedAt(bookmark),
  };

  if (grid) return <BookmarkGridItem {...layoutProps} />;
  return <BookmarkListItem {...layoutProps} />;
}

interface BookmarkLayoutProps {
  bookmark: ApplicationBookmark;
  isLarge: boolean;
  isSelected: boolean | undefined;
  onSelect: (() => void) | undefined;
  canOpen: boolean;
  href: string;
  target: "_blank" | undefined;
  rel: "noopener noreferrer" | undefined;
  onLinkClick: (event: { preventDefault: () => void }) => void;
  feedName: string;
  postedAt: Date;
}

function BookmarkGridItem({
  bookmark,
  isLarge,
  isSelected,
  onSelect,
  canOpen,
  href,
  target,
  rel,
  onLinkClick,
  feedName,
  postedAt,
}: BookmarkLayoutProps) {
  return (
    <article
      data-item-id={bookmark.id}
      data-entity-kind="bookmark"
      onMouseEnter={onSelect}
      className={clsx(
        "group relative flex h-full w-full flex-col",
        !canOpen && "opacity-50",
      )}
    >
      <Link
        to={href}
        target={target}
        rel={rel}
        aria-disabled={!canOpen}
        tabIndex={canOpen ? undefined : -1}
        onClick={onLinkClick}
        className={clsx(
          "flex h-full flex-1 flex-col rounded p-2 text-left",
          isSelected && "md:bg-muted",
          !canOpen && "cursor-not-allowed",
        )}
      >
        <BookmarkThumbnail
          bookmark={bookmark}
          layout={isLarge ? "large-grid" : "grid"}
        />
        <div className="flex flex-1 flex-col justify-center pt-2">
          <ItemTitle title={bookmark.title} lineClamp={isLarge ? 1 : 2} />
          <ItemMeta
            author={bookmark.author ?? undefined}
            feedName={feedName}
            postedAt={postedAt}
            className="pt-0.5"
          />
        </div>
      </Link>
      <BookmarkActions
        bookmark={bookmark}
        layout="grid"
        isSelected={isSelected}
      />
    </article>
  );
}

function BookmarkListItem({
  bookmark,
  isLarge,
  isSelected,
  onSelect,
  canOpen,
  href,
  target,
  rel,
  onLinkClick,
  feedName,
  postedAt,
}: BookmarkLayoutProps) {
  return (
    <article
      data-item-id={bookmark.id}
      data-entity-kind="bookmark"
      onMouseEnter={onSelect}
      className={clsx(
        "group relative flex flex-1 justify-stretch gap-2 md:mx-4 md:my-2",
        isLarge
          ? "flex-col md:flex-row md:items-center"
          : "items-center md:h-20",
        !canOpen && "opacity-50",
      )}
    >
      <Link
        to={href}
        target={target}
        rel={rel}
        aria-disabled={!canOpen}
        tabIndex={canOpen ? undefined : -1}
        onClick={onLinkClick}
        className={clsx(
          "flex w-full flex-1 flex-col gap-4 px-6 pt-4 text-left md:flex-row md:items-center md:rounded md:px-2 md:py-2",
          isLarge ? "pb-1 md:pb-2" : "pb-4 md:h-20 md:py-0",
          isSelected && "md:bg-muted",
          !canOpen && "cursor-not-allowed",
        )}
      >
        <div
          className={clsx("grid place-items-center", isLarge ? "w-44" : "w-16")}
        >
          <BookmarkThumbnail
            bookmark={bookmark}
            layout={isLarge ? "large-list" : "list"}
          />
        </div>
        <div className="flex h-full flex-1 flex-col justify-center pr-2">
          <ItemTitle title={bookmark.title} lineClamp={2} />
          {isLarge && (
            <ItemContentSnippet snippet={bookmark.description ?? undefined} />
          )}
          <ItemMeta
            author={bookmark.author ?? undefined}
            feedName={feedName}
            postedAt={postedAt}
          />
        </div>
      </Link>
      <BookmarkActions
        bookmark={bookmark}
        layout={isLarge ? "large-list" : "list"}
        isSelected={isSelected}
      />
    </article>
  );
}

interface ItemDisplayProps {
  contentId: string;
  size?: ItemSize;
  isSelected?: boolean;
  onSelect?: () => void;
  sectionItemType?: "feed" | "tag";
}

function FeedItemDisplay({
  contentId,
  size = "standard",
  isSelected,
  onSelect,
  sectionItemType,
}: ItemDisplayProps) {
  const feeds = useFeedsArray();
  const item = useFeedItemValue(contentId);
  const hasRetainedBody = useHasRetainedFeedItemBody(contentId);
  const connectionState = useAtomValue(connectionStateAtom);

  if (!item) return null;

  const feed = feeds.find((f) => f.id === item.feedId);

  const destination = contentDestination({
    entityKind: "feed-item",
    entity: item,
  });
  const shouldOpenInSerial =
    destination.renderer !== "origin" && feedOpensInSerial(feed);

  const canOpen = canOpenContent({
    connectionState,
    contentType: item.contentType,
    hasBody: hasRetainedFeedBody(item, hasRetainedBody),
  });
  const { isOffline, href, target, rel } = deriveItemLink({
    connectionState,
    offlineHref: `/read/${item.id}`,
    serialHref: destination.href,
    externalHref: item.url,
    opensExternally: !shouldOpenInSerial,
  });
  const preload =
    canOpen && !target && !isOffline ? ("intent" as const) : undefined;
  const handleLinkClick = createItemLinkClickHandler({
    canOpen,
    target,
    restorationId: contentId,
  });

  const isLarge = size === "large";

  return (
    <article
      data-item-id={contentId}
      onMouseEnter={onSelect}
      className={clsx(
        "group relative flex flex-1 justify-stretch gap-2 md:mx-4 md:my-2",
        isLarge
          ? "flex-col md:flex-row md:items-center"
          : "items-center md:h-20",
        !canOpen && "opacity-50",
      )}
    >
      <Link
        to={href}
        target={target}
        rel={rel}
        preload={preload}
        aria-disabled={!canOpen}
        tabIndex={canOpen ? undefined : -1}
        onClick={handleLinkClick}
        className={clsx(
          "flex w-full flex-1 flex-col gap-4 px-6 pt-4 text-left md:flex-row md:items-center md:rounded md:px-2 md:py-2",
          isLarge ? "pb-1 md:pb-2" : "pb-4 md:h-20 md:py-0",
          isSelected && "md:bg-muted",
          !canOpen && "cursor-not-allowed",
        )}
      >
        {isLarge ? (
          <>
            <div className="grid w-44 place-items-center">
              <ItemThumbnail
                layout="large-list"
                item={item}
                feed={feed}
                hideFeedIcon={sectionItemType === "feed"}
              />
            </div>
            <div className="flex h-full flex-1 flex-col justify-center pr-2">
              <ItemTitle title={item.title} lineClamp={2} />
              <ItemContentSnippet snippet={item.contentSnippet} />
              <ItemMeta
                author={item.author}
                feedName={feed?.name}
                postedAt={item.postedAt}
                className="pt-1"
              />
            </div>
          </>
        ) : (
          <>
            {sectionItemType !== "feed" && (
              <div className="grid w-16 place-items-center">
                <ItemThumbnail layout="list" item={item} feed={feed} />
              </div>
            )}
            <div className="flex h-full flex-1 flex-col justify-center">
              <ItemTitle title={item.title} lineClamp={2} />
              <ItemMeta
                author={item.author}
                feedName={feed?.name}
                postedAt={item.postedAt}
              />
            </div>
          </>
        )}
      </Link>
      <ItemActions
        contentId={contentId}
        item={item}
        layout={isLarge ? "large-list" : "list"}
        isSelected={isSelected}
      />
    </article>
  );
}

interface GridItemDisplayProps {
  contentId: string;
  size?: ItemSize;
  isSelected?: boolean;
  onSelect?: () => void;
  sectionItemType?: "feed" | "tag";
}

function FeedGridItemDisplay({
  contentId,
  size = "standard",
  isSelected,
  onSelect,
  sectionItemType,
}: GridItemDisplayProps) {
  const feeds = useFeedsArray();
  const item = useFeedItemValue(contentId);
  const hasRetainedBody = useHasRetainedFeedItemBody(contentId);
  const connectionState = useAtomValue(connectionStateAtom);

  if (!item) return null;

  const feed = feeds.find((f) => f.id === item.feedId);

  const itemDestination = item.platform === "website" ? "read" : "watch";

  const shouldOpenInSerial = feedOpensInSerial(feed);

  const canOpen = canOpenContent({
    connectionState,
    contentType: item.contentType,
    hasBody: hasRetainedFeedBody(item, hasRetainedBody),
  });
  const { isOffline, href, target, rel } = deriveItemLink({
    connectionState,
    offlineHref: `/read/${item.id}`,
    serialHref: `/${itemDestination}/${item.id}`,
    externalHref: item.url,
    opensExternally: !shouldOpenInSerial,
  });
  const preload =
    canOpen && !target && !isOffline ? ("intent" as const) : undefined;
  const handleLinkClick = createItemLinkClickHandler({
    canOpen,
    target,
    restorationId: contentId,
  });

  const isLarge = size === "large";

  return (
    <article
      data-item-id={contentId}
      onMouseEnter={onSelect}
      className={clsx(
        "group relative flex h-full w-full flex-col",
        !canOpen && "opacity-50",
      )}
    >
      <Link
        to={href}
        target={target}
        rel={rel}
        preload={preload}
        aria-disabled={!canOpen}
        tabIndex={canOpen ? undefined : -1}
        onClick={handleLinkClick}
        className={clsx(
          "flex h-full flex-1 flex-col rounded p-2 text-left",
          isSelected && "md:bg-muted",
          !canOpen && "cursor-not-allowed",
        )}
      >
        <ItemThumbnail
          layout={isLarge ? "large-grid" : "grid"}
          item={item}
          feed={feed}
          hideFeedIcon={sectionItemType === "feed"}
        />
        <div className="flex flex-1 flex-col justify-center pt-2">
          <ItemTitle title={item.title} lineClamp={isLarge ? 1 : 2} />
          {isLarge && <ItemContentSnippet snippet={item.contentSnippet} />}
          <ItemMeta
            author={item.author}
            feedName={feed?.name}
            postedAt={item.postedAt}
            className="pt-0.5"
          />
        </div>
      </Link>
      <ItemActions
        contentId={contentId}
        item={item}
        layout="grid"
        isSelected={isSelected}
      />
    </article>
  );
}

export function ItemDisplay(props: ItemDisplayProps) {
  const bookmark = useBookmarkValue(props.contentId);
  if (bookmark) {
    return (
      <BookmarkItemDisplay
        bookmark={bookmark}
        size={props.size ?? "standard"}
        isSelected={props.isSelected}
        onSelect={props.onSelect}
        grid={false}
      />
    );
  }
  return <FeedItemDisplay {...props} />;
}

export function GridItemDisplay(props: GridItemDisplayProps) {
  const bookmark = useBookmarkValue(props.contentId);
  if (bookmark) {
    return (
      <BookmarkItemDisplay
        bookmark={bookmark}
        size={props.size ?? "standard"}
        isSelected={props.isSelected}
        onSelect={props.onSelect}
        grid
      />
    );
  }
  return <FeedGridItemDisplay {...props} />;
}
