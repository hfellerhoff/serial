"use client";

import clsx from "clsx";

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
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
  getElements,
  useArticleNavigation,
} from "~/lib/hooks/useArticleNavigation";
import { useDebouncedSaveProgress } from "~/lib/hooks/useDebouncedSaveProgress";
import { useScrollDirection } from "~/lib/hooks/useScrollDirection";

const parser = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeSanitize)
  .use(rehypeStringify);

const MAX_WIDTH_MAP: Record<number, string> = {
  [0]: "container-xl",
  [1]: "container-2xl",
  [2]: "container-3xl",
  [3]: "container-4xl",
  [4]: "container-5xl",
  [5]: "container-6xl",
  [6]: "container-7xl",
};

export const Route = createFileRoute("/_app/read/$id")({
  component: ReadPage,
});

function ReadPage() {
  const params = Route.useParams();

  const [articleStyle] = useFlagState("ARTICLE_STYLE");

  const feedItem = useFeedItemValue(params.id);
  const { feeds } = useFeeds();

  const feed = feeds.find((f) => f.id === feedItem?.feedId);

  const { zoom } = useZoom();

  let content = feedItem?.content ?? "";

  if (articleStyle === "simplified") {
    content = String(parser.processSync(feedItem?.content ?? ""));
  }

  const articleRef = useRef<HTMLDivElement>(null);

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
  const { selectedIndex, selectElement } = useArticleNavigation(articleRef);

  // Save progress 500ms after last scroll event
  useDebouncedSaveProgress({
    contentId: params.id,
    getProgress: () => {
      const elements = getElements(articleRef.current);
      return {
        progress: Math.max(selectedIndex, 0),
        duration: elements.length,
      };
    },
  });

  // Restore progress on open — wait a frame so layout is complete
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (hasRestoredRef.current) return;
    if (feedItem == null) return;

    const progress = feedItem.progress ?? 0;

    if (progress <= 0) {
      hasRestoredRef.current = true;
      return;
    }

    const elements = getElements(articleRef.current);
    if (elements.length === 0) return;

    const targetIndex = Math.min(progress, elements.length - 1);
    hasRestoredRef.current = true;
    requestAnimationFrame(() => {
      selectElement(elements, targetIndex, true);
    });
  }, [feedItem?.progress, feedItem?.content, selectElement]);

  return (
    <div
      className={clsx("mx-auto grid h-full w-full place-items-center", {
        "max-w-xl": zoom === 0,
        "max-w-2xl": zoom === 1,
        "max-w-3xl": zoom === 2,
        "max-w-4xl": zoom === 3,
        "max-w-5xl": zoom === 4,
        "max-w-6xl": zoom === 5,
        "max-w-7xl": zoom === 6,
      })}
      style={{
        // @ts-expect-error This is fine and works
        [`--article-max-width`]: `var(--${MAX_WIDTH_MAP[zoom]})`,
      }}
    >
      <div className="mb-4 flex w-full items-center gap-3 px-6 sm:pt-6">
        {feed?.imageUrl ? (
          <img
            src={feed.imageUrl}
            alt={feedItem?.title}
            className="aspect-square h-6 rounded object-cover"
          />
        ) : (
          <div className="bg-muted aspect-square size-6 rounded object-cover" />
        )}
        <span className="line-clamp-1 font-sans text-sm">{feed?.name}</span>
      </div>
      <div
        ref={articleRef}
        className={`h-full w-full px-6 sm:pb-6 ${classes.article}`}
      >
        <h1 data-serial-header>{feedItem?.title}</h1>
        <h6 data-serial-header>{feedItem?.author || feed?.name || ""}</h6>
        {articleStyle === "simplified" ? (
          <div
            dangerouslySetInnerHTML={{
              __html: content,
            }}
          />
        ) : (
          <ArticleContent content={content} />
        )}
      </div>
      <div
        className={clsx(
          "sticky inset-x-0 bottom-0 left-0 grid place-items-center transition-transform duration-300",
          {
            "translate-y-full": barsHidden,
          },
        )}
      >
        <ContentActions contentID={params.id} />
      </div>
    </div>
  );
}
