"use client";

import clsx from "clsx";
import { BookmarkIcon } from "lucide-react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DatabasePageCapture } from "~/server/db/schema";
import { BookmarkArticleContent } from "~/components/bookmarks/BookmarkArticleContent";
import { BookmarkReaderActions } from "~/components/bookmarks/BookmarkReaderActions";
import { getArticleWidthLayout } from "~/components/content-reader/articleWidth";
import { ArticleSidebars } from "~/components/feed/read/ArticleSidebars";
import { useZoom } from "~/components/feed/watch/[id]/useZoom";
import classes from "~/components/feed/read/article.module.css";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { barsHiddenAtom } from "~/lib/data/atoms";
import { useBookmarkValue } from "~/lib/data/bookmarks";
import { bookmarksStore } from "~/lib/data/bookmarks/store";
import {
  bookmarkCapturesStore,
  useBookmarkCaptureValue,
} from "~/lib/data/bookmarks/capture-store";
import { shouldRetainBookmarkCapture } from "~/lib/data/offline-content";
import {
  getClosestVisibleElement,
  getElements,
  useArticleNavigation,
} from "~/lib/hooks/useArticleNavigation";
import { useDebouncedSaveBookmarkProgress } from "~/lib/hooks/useDebouncedSaveBookmarkProgress";
import { useRetentionPin } from "~/lib/hooks/useRetentionPin";
import { useOpenOriginalShortcut } from "~/lib/hooks/useOpenOriginalShortcut";
import { useScrollDirection } from "~/lib/hooks/useScrollDirection";
import { useRefreshBookmark } from "~/lib/hooks/useRefreshBookmark";
import { useRestoreArticleProgress } from "~/lib/hooks/useRestoreArticleProgress";
import { orpcRouterClient } from "~/lib/orpc";
import { getOriginActionLabel } from "~/lib/content/capabilities";
import { REMOTE_IMAGE_PROPS } from "~/lib/remoteMedia";

export function BookmarkReader({ id }: { id: string }) {
  const bookmark = useBookmarkValue(id);
  const refreshedBookmark = useRefreshBookmark(id);
  const retainedCapture = useBookmarkCaptureValue(id);
  const [captureResult, setCaptureResult] = useState<{
    bookmarkId: string;
    capture: DatabasePageCapture | null;
    source: "authoritative" | "failure";
  }>();
  const capture =
    captureResult?.bookmarkId === id
      ? captureResult.source === "failure"
        ? (retainedCapture ?? captureResult.capture)
        : captureResult.capture
      : retainedCapture;
  const articleRef = useRef<HTMLDivElement>(null);
  const [articleElement, setArticleElement] = useState<HTMLDivElement | null>(
    null,
  );
  const setBarsHidden = useSetAtom(barsHiddenAtom);
  const barsHidden = useAtomValue(barsHiddenAtom);
  const { zoom } = useZoom();
  const articleWidthLayout = getArticleWidthLayout(zoom);
  useRetentionPin("bookmark", id);
  useOpenOriginalShortcut(bookmark?.sourceUrl);

  useEffect(() => {
    let active = true;
    const cachedCapture = bookmarkCapturesStore.getState().capturesDict[id];
    void orpcRouterClient.bookmark
      .getCapture({
        bookmarkId: id,
        contentHash: cachedCapture?.contentHash,
      })
      .then((result) => {
        if (!active) return;
        if (result?.status === "capture") {
          // Retention is judged when the response lands so an archive that
          // happened mid-flight cannot re-persist the capture.
          const latestBookmark = bookmarksStore.getState().getBookmark(id);
          if (latestBookmark && shouldRetainBookmarkCapture(latestBookmark)) {
            bookmarkCapturesStore.getState().upsert(result.capture);
          }
          setCaptureResult({
            bookmarkId: id,
            capture: result.capture,
            source: "authoritative",
          });
        } else if (result?.status === "not-modified" && cachedCapture) {
          setCaptureResult({
            bookmarkId: id,
            capture: cachedCapture,
            source: "authoritative",
          });
        } else {
          bookmarkCapturesStore.getState().remove(id);
          setCaptureResult({
            bookmarkId: id,
            capture: null,
            source: "authoritative",
          });
        }
      })
      .catch(() => {
        if (active) {
          setCaptureResult((current) => ({
            bookmarkId: id,
            source: "failure",
            capture:
              current?.bookmarkId === id
                ? current.capture
                : (cachedCapture ?? null),
          }));
        }
      });
    return () => {
      active = false;
    };
  }, [id, bookmark?.captureHash]);

  useScrollDirection((direction) => setBarsHidden(direction === "down"));
  useEffect(() => () => setBarsHidden(false), [setBarsHidden]);

  const { scrollToElement } = useArticleNavigation(articleRef);
  useRestoreArticleProgress({
    contentId: id,
    articleElement,
    progress: refreshedBookmark?.progress ?? bookmark?.progress,
    ready: refreshedBookmark !== undefined,
  });
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
    const originActionLabel = getOriginActionLabel(bookmark);
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
              {originActionLabel}
            </a>
          </Button>
        </Alert>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "mx-auto grid h-full w-full place-items-center",
        articleWidthLayout.className,
      )}
      style={articleWidthLayout.style}
    >
      <div className="mb-4 flex w-full items-center gap-3 px-6 sm:pt-6">
        {bookmark.iconUrl ? (
          <img
            {...REMOTE_IMAGE_PROPS}
            src={bookmark.iconUrl}
            alt=""
            className="size-6 rounded object-contain"
          />
        ) : (
          <div className="bg-muted text-muted-foreground grid size-6 place-items-center rounded">
            <BookmarkIcon size={14} />
          </div>
        )}
        <span className="line-clamp-1 font-sans text-sm">
          {bookmark.siteName ?? new URL(bookmark.sourceUrl).hostname}
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
          <h1 data-serial-header>{bookmark.title}</h1>
          <h6 data-serial-header>{bookmark.author || ""}</h6>
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
