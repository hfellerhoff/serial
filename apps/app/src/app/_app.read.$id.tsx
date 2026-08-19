"use client";

import clsx from "clsx";

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { Loader2Icon, ScanTextIcon } from "lucide-react";
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
import { detectTruncatedContent } from "~/lib/utils/detectTruncatedContent";
import {
  hasRespondedToTruncationAlert,
  setTruncationAlertResponded,
} from "~/lib/utils/truncationAlert";
import { useEditFeedMutation } from "~/lib/data/feeds/mutations";
import { REMOTE_IMAGE_PROPS } from "~/lib/remoteMedia";
import { useFeedCategories } from "~/lib/data/feed-categories/store";
import { useViewFeeds } from "~/lib/data/view-feeds/store";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { ArticleSidebars } from "~/components/feed/read/ArticleSidebars";
import { useRetentionPin } from "~/lib/hooks/useRetentionPin";
import { useBookmarkValue } from "~/lib/data/bookmarks";
import { BookmarkReader } from "~/components/content-reader/BookmarkReader";
import { ContentRendererFallback } from "~/components/content-renderer/ContentRendererFallback";
import { getArticleWidthLayout } from "~/components/content-reader/articleWidth";
import {
  contentDestination,
  resolveContentItem,
} from "~/lib/data/content-items/resolver";
import { BookmarkArticleContent } from "~/components/bookmarks/BookmarkArticleContent";
import { requestPrototypeFeedItemCapture } from "~/lib/prototype-feed-item-capture";

type PrototypeCaptureState =
  | { status: "idle" }
  | { status: "capturing" }
  | {
      status: "captured";
      contentHtml: string;
      effectiveUrl: string;
    }
  | { status: "error"; message: string };

const parser = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeSanitize)
  .use(rehypeStringify);

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
    <FeedReader
      key={params.id}
      id={params.id}
      hasRefreshedFeedItem={hasRefreshedFeedItem}
    />
  );
}

function FeedReader({
  id,
  hasRefreshedFeedItem,
}: {
  id: string;
  hasRefreshedFeedItem: boolean;
}) {
  useRetentionPin("feed-item", id);

  const [articleStyle] = useFlagState("ARTICLE_STYLE");

  const feedItem = useFeedItemValue(id);
  const [prototypeCapture, setPrototypeCapture] =
    useState<PrototypeCaptureState>({ status: "idle" });

  const { feeds } = useFeeds();
  const feedCategories = useFeedCategories();
  const viewFeeds = useViewFeeds();

  const feed = feeds.find((f) => f.id === feedItem?.feedId);

  const { zoom } = useZoom();
  const articleWidthLayout = getArticleWidthLayout(zoom);

  let content = feedItem?.content ?? "";

  if (articleStyle === "simplified") {
    content = String(parser.processSync(feedItem?.content ?? ""));
  }

  const displayedContent =
    prototypeCapture.status === "captured"
      ? prototypeCapture.contentHtml
      : content;

  const captureSourcePage = async () => {
    if (!feedItem?.url || prototypeCapture.status === "capturing") return;
    setPrototypeCapture({ status: "capturing" });
    const response = await requestPrototypeFeedItemCapture(feedItem.url);
    setPrototypeCapture(
      response.ok
        ? {
            status: "captured",
            contentHtml: response.capture.contentHtml,
            effectiveUrl: response.capture.effectiveUrl,
          }
        : { status: "error", message: response.error },
    );
  };

  const articleRef = useRef<HTMLDivElement>(null);
  const [articleElement, setArticleElement] = useState<HTMLDivElement | null>(
    null,
  );
  const updateArticleRef = useCallback((element: HTMLDivElement | null) => {
    articleRef.current = element;
    setArticleElement(element);
  }, []);

  // Show/hide header and footer bars based on scroll direction
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

  // Truncation alert
  const { mutate: editFeed } = useEditFeedMutation();

  const [alertDismissed, setAlertDismissed] = useState(false);

  const feedId = feed?.id;
  const platform = feed?.platform;
  const hasTruncationAlertResponse = feedId
    ? hasRespondedToTruncationAlert(feedId)
    : false;

  const shouldCheckTruncatedContent =
    !alertDismissed &&
    platform === "website" &&
    !!feedId &&
    !hasTruncationAlertResponse &&
    !!feedItem;
  const shouldShowTruncationAlert =
    shouldCheckTruncatedContent &&
    feedItem !== undefined &&
    detectTruncatedContent(feedItem.content, feedItem.contentSnippet);

  const handleAlertResponse = (openLocation: "serial" | "origin") => {
    if (!feedId) return;

    const categoryIds = feedCategories
      .filter((fc) => fc.feedId === feedId)
      .map((fc) => fc.categoryId);
    const viewIds = viewFeeds
      .filter((vf) => vf.feedId === feedId)
      .map((vf) => vf.viewId);

    editFeed({
      feedId,
      categoryIds,
      viewIds,
      openLocation,
      name: feed?.name ?? "",
    });

    setTruncationAlertResponded(feedId);
    setAlertDismissed(true);

    if (openLocation === "origin" && feedItem?.url) {
      window.open(feedItem.url, "_blank", "noopener,noreferrer");
    }
  };

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
          contentKey={`${id}:${articleStyle}:${zoom}:${displayedContent}`}
          scrollToElement={scrollToElement}
        />
        <div
          ref={updateArticleRef}
          className={`h-full w-full px-6 sm:pb-6 ${classes.article}`}
        >
          <h1 data-serial-header>{feedItem?.title}</h1>
          <h6 data-serial-header>{feedItem?.author || feed?.name || ""}</h6>
          {prototypeCapture.status === "captured" ? (
            <BookmarkArticleContent content={prototypeCapture.contentHtml} />
          ) : articleStyle === "simplified" ? (
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
        <div className="w-full px-6">
          <Alert>
            <AlertTitle>Possible partial content detected</AlertTitle>
            <AlertDescription className="mt-2 text-base">
              It looks like this feed might not be providing all of its content
              in its feed. Would you like to open future items in the original
              website?
            </AlertDescription>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleAlertResponse("serial")}
              >
                No, view in reader
              </Button>
              <Button onClick={() => handleAlertResponse("origin")}>
                Yes, open in website
              </Button>
            </div>
          </Alert>
        </div>
      )}
      {prototypeCapture.status !== "idle" && (
        <p
          className="text-muted-foreground w-full px-6 text-center font-sans text-sm"
          role="status"
        >
          {prototypeCapture.status === "capturing"
            ? "Capturing the authenticated source page in a background tab…"
            : prototypeCapture.status === "captured"
              ? `Showing an ephemeral capture from ${new URL(prototypeCapture.effectiveUrl).host}. Reload to restore the Feed body.`
              : prototypeCapture.message}
        </p>
      )}
      <div
        className={clsx(
          "sticky inset-x-0 bottom-0 left-0 grid place-items-center transition-transform duration-300",
          {
            "translate-y-full": barsHidden,
          },
        )}
      >
        <ContentActions
          contentID={id}
          prototypeCaptureAction={
            <Button
              data-prototype-capture-state={prototypeCapture.status}
              variant={
                prototypeCapture.status === "captured" ? "secondary" : "outline"
              }
              size="icon md:default"
              disabled={
                !feedItem?.url || prototypeCapture.status === "capturing"
              }
              onClick={() => void captureSourcePage()}
            >
              {prototypeCapture.status === "capturing" ? (
                <Loader2Icon className="animate-spin" size={16} />
              ) : (
                <ScanTextIcon size={16} />
              )}
              <span className="hidden pl-1.5 md:block">
                {prototypeCapture.status === "capturing"
                  ? "Capturing"
                  : "Capture"}
              </span>
            </Button>
          }
        />
      </div>
    </div>
  );
}
