"use client";

import { useCallback, useEffect, useRef } from "react";
import { orpcRouterClient } from "../orpc";
import { buildViewManifests } from "./buildViewManifests";
import { loadingActor } from "./loading-machine";
import { feedItemsStore } from "./store";
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

/**
 * Hook that manages the subscription to the user's data channel.
 * Handles connection lifecycle, auto-reconnection, and exposes request methods.
 */
export function useDataSubscription() {
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
    feedItemsStore.getState().processChunks(chunks);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Per-connection controller — aborted on visibility change to force
    // a reconnect without tearing down the entire subscription lifecycle.
    let connectionController: AbortController | null = null;
    let visibilityReconnect = false;
    let paused = false;

    async function subscribe() {
      while (!controller.signal.aborted) {
        // Wait while the page is hidden — no point holding an SSE
        // connection open when the tab isn't visible.
        if (paused) {
          await new Promise<void>((resolve) => {
            const check = () => {
              if (!paused || controller.signal.aborted) {
                document.removeEventListener("visibilitychange", check);
                resolve();
              }
            };
            document.addEventListener("visibilitychange", check);
            // In case the flag was already flipped before we started listening
            check();
          });
          if (controller.signal.aborted) break;
        }

        const conn = new AbortController();
        connectionController = conn;

        // Cascade main abort → connection abort so unmount kills the
        // active connection immediately.
        const forwardAbort = () => conn.abort();
        controller.signal.addEventListener("abort", forwardAbort, {
          once: true,
        });

        try {
          isConnectedRef.current = true;
          retryDelayRef.current = INITIAL_RETRY_DELAY;

          const iterator = await orpcRouterClient.initial.subscribe(undefined, {
            signal: conn.signal,
          });

          // After reconnecting due to page refocus, re-request data so
          // the server sends fresh metadata, diffs, and triggers a
          // refresh if the cooldown elapsed while the tab was hidden.
          if (visibilityReconnect) {
            visibilityReconnect = false;
            const state = feedItemsStore.getState();
            const hasCachedData = Object.keys(state.feedItemsDict).length > 0;
            if (hasCachedData) {
              void orpcRouterClient.initial.requestInitialData({
                viewManifests: buildViewManifests(state),
              });
            } else {
              void orpcRouterClient.initial.requestInitialData();
            }
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
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelayRef.current),
          );

          // Increase retry delay for next attempt
          retryDelayRef.current = Math.min(
            retryDelayRef.current * BACKOFF_MULTIPLIER,
            MAX_RETRY_DELAY,
          );
        } finally {
          controller.signal.removeEventListener("abort", forwardAbort);
        }
      }
    }

    // Disconnect on page hide, reconnect on refocus. Keeping the SSE
    // pipe open while the tab is hidden wastes server resources and the
    // connection often goes stale anyway.
    const handleVisibilityChange = () => {
      if (controller.signal.aborted) return;

      if (document.visibilityState === "hidden") {
        paused = true;
        connectionController?.abort();
      } else if (document.visibilityState === "visible") {
        // Reset the machine so stale in-flight state doesn't confuse
        // the freshly requested data stream.
        loadingActor.send({ type: "RESET" });
        paused = false;
        visibilityReconnect = true;
        // If the loop is waiting on the paused promise, the
        // visibilitychange listener inside it will resolve it.
        // If it's in a backoff sleep, the next iteration will
        // see paused=false and proceed normally.
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    subscribe();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      controller.abort();
      isConnectedRef.current = false;
      // Cancel any pending RAF flush
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      // Flush remaining chunks synchronously on unmount
      if (chunkBufferRef.current.length > 0) {
        feedItemsStore.getState().processChunks(chunkBufferRef.current);
        chunkBufferRef.current = [];
      }
    };
  }, [flushBuffer]);

  // Request methods that trigger data fetching via the publisher
  const requestInitialData = useCallback(
    (options?: {
      viewManifests?: Record<number, Record<string, ClientManifestEntry[]>>;
    }) => {
      return orpcRouterClient.initial.requestInitialData(options ?? undefined);
    },
    [],
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
      });
    },
    [],
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
      });
    },
    [],
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
      });
    },
    [],
  );

  return {
    requestInitialData,
    requestItemsByVisibility,
    requestItemsByFeed,
    requestItemsByCategoryId,
    isConnected: isConnectedRef.current,
  };
}

/**
 * Singleton context provider for the data subscription.
 * This allows accessing request methods from anywhere in the app.
 */
export const dataSubscriptionActions = {
  requestInitialData: (options?: {
    viewManifests?: Record<number, Record<string, ClientManifestEntry[]>>;
  }) => {
    return orpcRouterClient.initial.requestInitialData(options ?? undefined);
  },
  streamingImport: (
    feeds: Array<{ feedUrl: string; categories: string[] }>,
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
    }),
};
