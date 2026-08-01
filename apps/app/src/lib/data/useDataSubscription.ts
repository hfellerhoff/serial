"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDefaultStore } from "jotai";
import { orpcRouterClient } from "../orpc";
import { getDataSubscriptionClientId } from "./clientChannel";
import { combineAbortSignals } from "./combineAbortSignals";
import { loadingActor } from "./loading-machine";
import { bookmarksStore } from "./bookmarks/store";
import { processPublishedChunks } from "./subscriptionCoordinator";
import { shouldAlwaysKeepSSEConnectionAlive } from "./atoms";
import { getFeedItemMembershipRevision } from "./feed-items/membershipRevision";
import type { PublishedChunk } from "~/server/api/publisher";
import type { VisibilityFilter } from "./atoms";
import type {
  ClientManifestEntry,
  PaginationCursor,
} from "~/server/api/routers/initialRouter";

// Exponential backoff configuration
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 30000; // 30 seconds
const BACKOFF_MULTIPLIER = 2;

function waitForAbortableDelay(delay: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timeoutId = setTimeout(finish, delay);
    signal.addEventListener("abort", finish, { once: true });
  });
}

function waitForVisibilityChange(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      document.removeEventListener("visibilitychange", finish);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    document.addEventListener("visibilitychange", finish, { once: true });
    signal.addEventListener("abort", finish, { once: true });
  });
}

/**
 * Hook that manages the subscription to the user's data channel.
 * Handles connection lifecycle, auto-reconnection, and exposes request methods.
 */
export function useDataSubscription() {
  const [clientId] = useState(() => getDataSubscriptionClientId());
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryDelayRef = useRef(INITIAL_RETRY_DELAY);
  const isConnectedRef = useRef(false);

  // Buffer chunks and flush via requestAnimationFrame for micro-batching
  const chunkBufferRef = useRef<PublishedChunk[]>([]);
  const rafIdRef = useRef<number | null>(null);

  const flushBuffer = useCallback(() => {
    rafIdRef.current = null;
    const chunks = chunkBufferRef.current;
    if (chunks.length === 0) return;
    chunkBufferRef.current = [];
    const affectedScopes = processPublishedChunks(chunks);
    for (const scope of affectedScopes) {
      void orpcRouterClient.mixedContent.requestPage({
        clientId,
        scope: scope.scope,
        visibility: scope.visibility,
        cursor: null,
      });
    }
  }, [clientId]);

  // Cleanup aborts the stream and removes both direct subscriptions. The
  // subscription loop also combines its connection signal with this abort.
  // oxlint-disable-next-line react-doctor/effect-needs-cleanup
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    abortControllerRef.current = controller;

    // Per-connection controller — aborted on visibility change to force
    // a reconnect without tearing down the entire subscription lifecycle.
    let connectionController: AbortController | null = null;
    let visibilityReconnect = false;
    let paused = false;

    async function runSubscriptionLoop() {
      while (!signal.aborted) {
        // Wait while the page is hidden — no point holding an SSE
        // connection open when the tab isn't visible.
        while (paused && !signal.aborted) {
          // Visibility changes must be consumed in order.
          // oxlint-disable-next-line react-doctor/async-await-in-loop
          await waitForVisibilityChange(signal);
          if (signal.aborted) break;
        }

        const conn = new AbortController();
        connectionController = conn;
        const { signal: connectionSignal, cleanup: cleanupConnectionSignal } =
          combineAbortSignals([signal, conn.signal]);

        try {
          isConnectedRef.current = true;
          retryDelayRef.current = INITIAL_RETRY_DELAY;

          // Each reconnect depends on the prior connection closing.
          // oxlint-disable-next-line react-doctor/async-await-in-loop
          const iterator = await orpcRouterClient.initial.subscribe(
            { clientId },
            { signal: connectionSignal },
          );

          // After reconnecting due to page refocus, re-request data so
          // the server sends fresh metadata, diffs, and triggers a
          // refresh if the cooldown elapsed while the tab was hidden.
          if (visibilityReconnect) {
            visibilityReconnect = false;
            void Promise.all([
              orpcRouterClient.initial.requestInitialData({ clientId }),
              orpcRouterClient.mixedContent.synchronize({
                clientId,
                bookmarkManifest: bookmarksStore.getState().manifest(),
              }),
            ]);
          }

          for await (const payload of iterator as AsyncIterable<PublishedChunk>) {
            if (conn.signal.aborted) break;

            // Buffer the chunk and schedule a flush via RAF
            chunkBufferRef.current.push(payload);
            if (rafIdRef.current === null) {
              rafIdRef.current = requestAnimationFrame(flushBuffer);
            }
          }
        } catch (error) {
          isConnectedRef.current = false;

          if (controller.signal.aborted) break;

          // Skip backoff for visibility-triggered reconnects
          if (conn.signal.aborted) continue;

          console.error("Subscription error, retrying...", error);

          // Wait with exponential backoff before retrying
          await waitForAbortableDelay(retryDelayRef.current, controller.signal);

          // Increase retry delay for next attempt
          retryDelayRef.current = Math.min(
            retryDelayRef.current * BACKOFF_MULTIPLIER,
            MAX_RETRY_DELAY,
          );
        } finally {
          cleanupConnectionSignal();
        }
      }
    }

    // Disconnect on page hide, reconnect on refocus. Keeping the SSE
    // pipe open while the tab is hidden wastes server resources and the
    // connection often goes stale anyway.
    const updateConnectionState = () => {
      if (controller.signal.aborted) return;

      const shouldStayAlive = getDefaultStore().get(
        shouldAlwaysKeepSSEConnectionAlive,
      );
      const wasPaused = paused;

      if (document.visibilityState === "hidden" && !shouldStayAlive) {
        paused = true;
        connectionController?.abort();
      } else if (
        document.visibilityState === "visible" ||
        (document.visibilityState === "hidden" && shouldStayAlive)
      ) {
        paused = false;
        visibilityReconnect = true;
        // If the loop is waiting on the paused promise, the
        // visibilitychange listener inside it will resolve it.
        // If it's in a backoff sleep, the next iteration will
        // see paused=false and proceed normally.
      }

      // Only reset the loading machine when transitioning from paused
      // to unpaused (i.e. the SSE is actually resuming after being
      // disconnected due to visibility rules).
      if (wasPaused && !paused) {
        loadingActor.send({ type: "RESET" });
      }
    };

    const handleVisibilityChange = () => {
      updateConnectionState();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Recompute connection logic when the keep-alive atom changes
    const unsubscribeAtom = getDefaultStore().sub(
      shouldAlwaysKeepSSEConnectionAlive,
      () => {
        updateConnectionState();
      },
    );

    void runSubscriptionLoop();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      unsubscribeAtom();
      controller.abort();
      isConnectedRef.current = false;
      // Cancel any pending RAF flush
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      // Flush remaining chunks synchronously on unmount
      if (chunkBufferRef.current.length > 0) {
        processPublishedChunks(chunkBufferRef.current);
        chunkBufferRef.current = [];
      }
    };
  }, [clientId, flushBuffer]);

  // Request methods that trigger data fetching via the publisher
  const requestInitialData = useCallback(() => {
    return Promise.all([
      orpcRouterClient.initial.requestInitialData({ clientId }),
      orpcRouterClient.mixedContent.synchronize({
        clientId,
        bookmarkManifest: bookmarksStore.getState().manifest(),
      }),
    ]);
  }, [clientId]);

  const requestFullTextForItems = useCallback(
    (itemIds: string[]) => {
      return orpcRouterClient.initial.requestFullTextForItems({
        itemIds,
        clientId,
      });
    },
    [clientId],
  );

  const requestItemsByVisibility = useCallback(
    (
      viewId: number,
      visibilityFilter: VisibilityFilter,
      cursor?: PaginationCursor,
      limit?: number,
      clientItems?: ClientManifestEntry[],
    ) => {
      return orpcRouterClient.initial.requestItemsByVisibility({
        viewId,
        visibilityFilter,
        cursor,
        limit,
        clientItems,
        membershipRevision: getFeedItemMembershipRevision(),
        clientId,
      });
    },
    [clientId],
  );

  const requestItemsByFeed = useCallback(
    (
      feedId: number,
      visibilityFilter: VisibilityFilter,
      cursor?: PaginationCursor,
      limit?: number,
    ) => {
      return orpcRouterClient.initial.requestItemsByFeed({
        feedId,
        visibilityFilter,
        cursor,
        limit,
        clientId,
      });
    },
    [clientId],
  );

  const requestItemsByCategoryId = useCallback(
    (
      categoryId: number,
      visibilityFilter: VisibilityFilter,
      cursor?: PaginationCursor,
      limit?: number,
    ) => {
      return orpcRouterClient.initial.requestItemsByCategoryId({
        categoryId,
        visibilityFilter,
        cursor,
        limit,
        clientId,
      });
    },
    [clientId],
  );

  return {
    requestInitialData,
    requestFullTextForItems,
    requestItemsByVisibility,
    requestItemsByFeed,
    requestItemsByCategoryId,
  };
}

/**
 * Singleton context provider for the data subscription.
 * This allows accessing request methods from anywhere in the app.
 */
export const dataSubscriptionActions = {
  requestInitialData: () => {
    const clientId = getDataSubscriptionClientId();
    return Promise.all([
      orpcRouterClient.initial.requestInitialData({ clientId }),
      orpcRouterClient.mixedContent.synchronize({
        clientId,
        bookmarkManifest: bookmarksStore.getState().manifest(),
      }),
    ]);
  },
  requestMixedContentPage: (
    scope: Parameters<
      typeof orpcRouterClient.mixedContent.requestPage
    >[0]["scope"],
    visibility: VisibilityFilter,
    cursor?: Parameters<
      typeof orpcRouterClient.mixedContent.requestPage
    >[0]["cursor"],
    limit?: number,
  ) =>
    orpcRouterClient.mixedContent.requestPage({
      clientId: getDataSubscriptionClientId(),
      scope,
      visibility,
      cursor,
      limit,
    }),
  requestFullTextForItems: (itemIds: string[]) => {
    return orpcRouterClient.initial.requestFullTextForItems({
      itemIds,
      clientId: getDataSubscriptionClientId(),
    });
  },
  streamingImport: (
    feeds: Array<{
      feedUrl: string;
      categories: string[];
      categoryPaths?: Array<
        Array<{
          name: string;
          type?: "view" | "tag" | "feed";
          feedUrl?: string;
        }>
      >;
      tagNames?: string[];
    }>,
    importMode?: "tags" | "views" | "ignore",
  ) => orpcRouterClient.initial.streamingImport({ feeds, importMode }),
  requestItemsByVisibility: (
    viewId: number,
    visibilityFilter: VisibilityFilter,
    cursor?: PaginationCursor,
    limit?: number,
    clientItems?: ClientManifestEntry[],
  ) =>
    orpcRouterClient.initial.requestItemsByVisibility({
      viewId,
      visibilityFilter,
      cursor,
      limit,
      clientItems,
      membershipRevision: getFeedItemMembershipRevision(),
      clientId: getDataSubscriptionClientId(),
    }),
  requestItemsByFeed: (
    feedId: number,
    visibilityFilter: VisibilityFilter,
    cursor?: PaginationCursor,
    limit?: number,
  ) =>
    orpcRouterClient.initial.requestItemsByFeed({
      feedId,
      visibilityFilter,
      cursor,
      limit,
      clientId: getDataSubscriptionClientId(),
    }),
  requestItemsByCategoryId: (
    categoryId: number,
    visibilityFilter: VisibilityFilter,
    cursor?: PaginationCursor,
    limit?: number,
  ) =>
    orpcRouterClient.initial.requestItemsByCategoryId({
      categoryId,
      visibilityFilter,
      cursor,
      limit,
      clientId: getDataSubscriptionClientId(),
    }),
};
