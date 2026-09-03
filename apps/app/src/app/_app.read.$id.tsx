"use client";

import clsx from "clsx";

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import rehypeParse from "rehype-parse";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";
import { useZoom } from "../components/feed/watch/[id]/useZoom";
import { ContentActions } from "../components/feed/watch/[id]/ContentActions";
import { useFeeds } from "~/lib/data/feeds";
import { barsHiddenAtom } from "~/lib/data/atoms";
import { useFlagState } from "~/lib/hooks/useFlagState";
import classes from "~/components/feed/read/article.module.css";
import { useFeedItemValue } from "~/lib/data/store";
import { ArticleContent } from "~/components/feed/read/ArticleContent";
import { useOpenOriginalShortcut } from "~/lib/hooks/useOpenOriginalShortcut";
import {
  getClosestVisibleElement,
  getElements,
  useArticleNavigation,
} from "~/lib/hooks/useArticleNavigation";
import { useDebouncedSaveProgress } from "~/lib/hooks/useDebouncedSaveProgress";
import { useRefreshFeedItem } from "~/lib/hooks/useRefreshFeedItem";
import { useRestoreArticleProgress } from "~/lib/hooks/useRestoreArticleProgress";
import { useScrollDirection } from "~/lib/hooks/useScrollDirection";
import { REMOTE_IMAGE_PROPS } from "~/lib/remoteMedia";
import { ArticleSidebars } from "~/components/feed/read/ArticleSidebars";
import {
  TruncationAlert,
  useTruncationAlert,
} from "~/components/feed/read/TruncationAlert";
import { useRetentionPin } from "~/lib/hooks/useRetentionPin";
import { useBookmarkValue } from "~/lib/data/bookmarks";
import { BookmarkReader } from "~/components/content-reader/BookmarkReader";
import { ContentRendererFallback } from "~/components/content-renderer/ContentRendererFallback";
import { getArticleWidthLayout } from "~/components/content-reader/articleWidth";
import { useCanMutate } from "~/lib/data/offline-mutations";
import {
  contentDestination,
  resolveContentItem,
} from "~/lib/data/content-items/resolver";

const parser = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeSanitize)
  .use(rehypeStringify);

function getReaderContent(
  feedItem: { content?: string } | undefined,
  articleStyle: "simplified" | "full",
) {
  if (articleStyle === "simplified") {
    return String(parser.processSync(feedItem?.content ?? ""));
  }
  return feedItem?.content ?? "";
}

export const Route = createFileRoute("/_app/read/$id")({
  component: ReadPage,
});

function ReadPage() {
  const params = Route.useParams();
  const bookmark = useBookmarkValue(params.id);
  const feedItem = useFeedItemValue(params.id);
  const hasRefreshedFeedItem = useRefreshFeedItem(
    bookmark ? undefined : params.id,
  );
  const resolution = resolveContentItem({ bookmark, feedItem });
  if (resolution.status === "ambiguous") {
    return <p className="p-6 text-center">This content ID is ambiguous.</p>;
  }
  if (resolution.status === "missing") {
    return <p className="p-6 text-center">Loading content…</p>;
  }
  const destination = contentDestination(resolution.item);
  if (destination.renderer !== "read") {
    return <ContentRendererFallback destination={destination} />;
  }
  if (resolution.item.entityKind === "bookmark") {
    return <BookmarkReader id={params.id} />;
  }
  return (
    <FeedReader id={params.id} hasRefreshedFeedItem={hasRefreshedFeedItem} />
  );
}

// Show/hide header and footer bars based on scroll direction
function useReaderBars() {
  const setBarsHidden = useSetAtom(barsHiddenAtom);
  const barsHidden = useAtomValue(barsHiddenAtom);
  const handleScrollDirection = useCallback(
    (direction: "up" | "down") => {
      setBarsHidden(direction === "down");
    },
    [setBarsHidden],
  );
  useScrollDirection(handleScrollDirection);

  // Reset bars visibility when leaving the article
  useEffect(() => {
    return () => {
      setBarsHidden(false);
    };
  }, [setBarsHidden]);

  return barsHidden;
}

function FeedReader({
  id,
  hasRefreshedFeedItem,
}: {
  id: string;
  hasRefreshedFeedItem: boolean;
}) {
  const canMutate = useCanMutate();
  useRetentionPin("feed-item", id);

  const [articleStyle] = useFlagState("ARTICLE_STYLE");

  const feedItem = useFeedItemValue(id);

  const { feeds } = useFeeds();

  const feed = feeds.find((f) => f.id === feedItem?.feedId);

  const { zoom } = useZoom();
  const articleWidthLayout = getArticleWidthLayout(zoom);

  const content = getReaderContent(feedItem, articleStyle);

  const articleRef = useRef<HTMLDivElement>(null);
  const [articleElement, setArticleElement] = useState<HTMLDivElement | null>(
    null,
  );
  const updateArticleRef = useCallback((element: HTMLDivElement | null) => {
    articleRef.current = element;
    setArticleElement(element);
  }, []);

  const barsHidden = useReaderBars();

  // Shortcut to open original URL
  useOpenOriginalShortcut(feedItem?.url);

  // Arrow key navigation between paragraphs/headings
  const { scrollToElement } = useArticleNavigation(articleRef);
  useRestoreArticleProgress({
    contentId: id,
    articleElement,
    progress: feedItem?.progress,
    ready: hasRefreshedFeedItem,
  });

  // Save progress 500ms after last scroll event
  useDebouncedSaveProgress({
    contentId: id,
    getProgress: () => {
      const elements = getElements(articleRef.current);
      const closestVisibleIndex = getClosestVisibleElement(elements);
      return {
        progress: Math.max(closestVisibleIndex, 0),
        duration: elements.length,
      };
    },
  });

  const { shouldShowTruncationAlert, handleAlertResponse } = useTruncationAlert(
    { feed, feedItem, canMutate },
  );

  return (
    <div
      className={clsx(
        "mx-auto grid h-full w-full place-items-center",
        articleWidthLayout.className,
      )}
      style={articleWidthLayout.style}
    >
      <div className="mb-4 flex w-full items-center gap-3 px-6 sm:pt-6">
        {feed?.imageUrl ? (
          <img
            {...REMOTE_IMAGE_PROPS}
            src={feed.imageUrl}
            alt={feedItem?.title}
            className="aspect-square h-6 rounded object-cover"
          />
        ) : (
          <div className="bg-muted aspect-square size-6 rounded object-cover" />
        )}
        <span className="line-clamp-1 font-sans text-sm">{feed?.name}</span>
      </div>
      <div key={id} className="relative w-full">
        <ArticleSidebars
          article={articleElement}
          contentKey={`${id}:${articleStyle}:${zoom}:${content}`}
          scrollToElement={scrollToElement}
        />
        <div
          ref={updateArticleRef}
          className={`h-full w-full px-6 sm:pb-6 ${classes.article}`}
        >
          <h1 data-serial-header>{feedItem?.title}</h1>
          <h6 data-serial-header>{feedItem?.author || feed?.name || ""}</h6>
          {articleStyle === "simplified" ? (
            // Content is sanitized by the module-level rehype pipeline above.
            // react-doctor-disable-next-line react-doctor/dangerous-html-sink
            <div
              dangerouslySetInnerHTML={{
                __html: content,
              }}
            />
          ) : (
            <ArticleContent content={content} />
          )}
        </div>
      </div>
      {shouldShowTruncationAlert && (
        <TruncationAlert
          canMutate={canMutate}
          onRespond={handleAlertResponse}
        />
      )}
      <div
        className={clsx(
          "sticky inset-x-0 bottom-0 left-0 grid place-items-center transition-transform duration-300",
          {
            "translate-y-full": barsHidden,
          },
        )}
      >
        <ContentActions contentID={id} />
      </div>
    </div>
  );
}
