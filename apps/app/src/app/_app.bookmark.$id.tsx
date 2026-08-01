"use client";

import clsx from "clsx";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { DatabasePageCapture } from "~/server/db/schema";
import { BookmarkArticleContent } from "~/components/bookmarks/BookmarkArticleContent";
import { BookmarkReaderActions } from "~/components/bookmarks/BookmarkReaderActions";
import { ArticleSidebars } from "~/components/feed/read/ArticleSidebars";
import classes from "~/components/feed/read/article.module.css";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { barsHiddenAtom } from "~/lib/data/atoms";
import { useBookmarkValue } from "~/lib/data/bookmarks";
import {
  getClosestVisibleElement,
  getElements,
  useArticleNavigation,
} from "~/lib/hooks/useArticleNavigation";
import { useDebouncedSaveBookmarkProgress } from "~/lib/hooks/useDebouncedSaveBookmarkProgress";
import { useRetentionPin } from "~/lib/hooks/useRetentionPin";
import { useOpenOriginalShortcut } from "~/lib/hooks/useOpenOriginalShortcut";
import { useScrollDirection } from "~/lib/hooks/useScrollDirection";
import { orpcRouterClient } from "~/lib/orpc";
import { getScrollContainer } from "~/lib/scroll";

const captureCache = new Map<string, DatabasePageCapture>();

export const Route = createFileRoute("/_app/bookmark/$id")({
  component: BookmarkReaderPage,
});

function BookmarkReaderPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const bookmark = useBookmarkValue(id);
  const [capture, setCapture] = useState<
    DatabasePageCapture | null | undefined
  >(() => captureCache.get(id));
  const articleRef = useRef<HTMLDivElement>(null);
  const [articleElement, setArticleElement] = useState<HTMLDivElement | null>(
    null,
  );
  const setBarsHidden = useSetAtom(barsHiddenAtom);
  const barsHidden = useAtomValue(barsHiddenAtom);
  useRetentionPin("bookmark", id);
  useOpenOriginalShortcut(bookmark?.sourceUrl);

  useEffect(() => {
    let active = true;
    const cachedCapture = captureCache.get(id);
    void orpcRouterClient.bookmark
      .getCapture({
        bookmarkId: id,
        contentHash: cachedCapture?.contentHash,
      })
      .then((result) => {
        if (!active) return;
        if (result?.status === "capture") {
          captureCache.set(id, result.capture);
          setCapture(result.capture);
        } else if (result?.status === "not-modified" && cachedCapture) {
          setCapture(cachedCapture);
        } else {
          setCapture(null);
        }
      })
      .catch(() => {
        if (active) setCapture(null);
      });
    return () => {
      active = false;
    };
  }, [id, bookmark?.captureHash]);

  useScrollDirection((direction) => setBarsHidden(direction === "down"));
  useEffect(() => () => setBarsHidden(false), [setBarsHidden]);

  const { scrollToElement } = useArticleNavigation(articleRef);
  useDebouncedSaveBookmarkProgress({
    bookmarkId: id,
    getProgress: () => {
      const elements = getElements(articleRef.current);
      return {
        progress: Math.max(getClosestVisibleElement(elements), 0),
        duration: elements.length,
      };
    },
  });

  useLayoutEffect(() => {
    const resetScroll = () =>
      getScrollContainer().scrollTo({ top: 0, behavior: "instant" });
    resetScroll();
    const unsubscribe = router.subscribe("onRendered", (event) => {
      if (event.pathChanged) queueMicrotask(resetScroll);
    });
    return unsubscribe;
  }, [id, router]);

  const updateArticleRef = useCallback((element: HTMLDivElement | null) => {
    articleRef.current = element;
    setArticleElement(element);
  }, []);

  if (!bookmark || capture === undefined) {
    return (
      <p className="p-6 text-center" role="status">
        Loading Bookmark…
      </p>
    );
  }

  if (!capture) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Alert>
          <AlertTitle>No Page capture is available</AlertTitle>
          <AlertDescription>
            The Bookmark is safe. Open the original page to continue reading.
          </AlertDescription>
          <Button className="mt-4" asChild>
            <a
              href={bookmark.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Website
            </a>
          </Button>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto grid h-full w-full max-w-3xl place-items-center">
      <div className="mb-4 flex w-full items-center gap-3 px-6 sm:pt-6">
        {bookmark.iconUrl ? (
          <img
            src={bookmark.iconUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="size-6 rounded object-contain"
          />
        ) : (
          <div className="bg-muted size-6 rounded" />
        )}
        <span className="line-clamp-1 font-sans text-sm">
          {new URL(bookmark.sourceUrl).hostname}
        </span>
      </div>
      <div className="relative w-full">
        <ArticleSidebars
          article={articleElement}
          contentKey={`${id}:${capture.contentHash}`}
          scrollToElement={scrollToElement}
        />
        <article
          ref={updateArticleRef}
          className={`h-full w-full px-6 sm:pb-6 ${classes.article}`}
        >
          <h1 data-serial-header>{capture.title}</h1>
          <h6 data-serial-header>{capture.author || ""}</h6>
          <BookmarkArticleContent content={capture.contentHtml} />
        </article>
      </div>
      <div
        className={clsx(
          "sticky inset-x-0 bottom-0 left-0 grid place-items-center transition-transform duration-300",
          barsHidden && "translate-y-full",
        )}
      >
        <BookmarkReaderActions bookmarkId={id} />
      </div>
    </div>
  );
}
