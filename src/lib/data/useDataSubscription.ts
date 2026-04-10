"use client";

import { useCallback, useEffect, useRef } from "react";
import { orpcRouterClient } from "../orpc";
import { feedItemsStore } from "./store";
import type { PublishedChunk } from "~/server/api/publisher";
import type { VisibilityFilter } from "./atoms";
import type { PaginationCursor } from "~/server/api/routers/initialRouter";

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

    async function subscribe() {
      while (!controller.signal.aborted) {
        try {
          // Reset retry delay on successful connection
          isConnectedRef.current = true;
          retryDelayRef.current = INITIAL_RETRY_DELAY;

          const iterator = await orpcRouterClient.initial.subscribe(undefined, {
            signal: controller.signal,
          });

          for await (const payload of iterator as AsyncIterable<PublishedChunk>) {
            if (controller.signal.aborted) break;

            // Buffer the chunk and schedule a flush via RAF
            chunkBufferRef.current.push(payload);
            if (rafIdRef.current === null) {
              rafIdRef.current = requestAnimationFrame(flushBuffer);
            }
          }
        } catch (error) {
          isConnectedRef.current = false;

          // Don't retry if aborted

          if (controller.signal.aborted) {
            break;
          }

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
        }
      }
    }

    subscribe();

    return () => {
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
    (visibilityFilter?: VisibilityFilter) => {
      return orpcRouterClient.initial.requestInitialData(
        visibilityFilter ? { visibilityFilter } : undefined,
      );
    },
    [],
  );

  const requestItemsByVisibility = useCallback(
    (
      viewId: number,
      visibilityFilter: VisibilityFilter,
      cursor?: PaginationCursor,
      limit?: number,
    ) => {
      return orpcRouterClient.initial.requestItemsByVisibility({
        viewId,
        visibilityFilter,
        cursor,
        limit,
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
  requestInitialData: (visibilityFilter?: VisibilityFilter) =>
    orpcRouterClient.initial.requestInitialData(
      visibilityFilter ? { visibilityFilter } : undefined,
    ),
  requestImportedData: (newFeedIds: number[]) =>
    orpcRouterClient.initial.requestImportedData({ newFeedIds }),
  streamingImport: (
    feeds: Array<{ feedUrl: string; categories: string[] }>,
    importMode?: "tags" | "views" | "ignore",
  ) => orpcRouterClient.initial.streamingImport({ feeds, importMode }),
  requestItemsByVisibility: (
    viewId: number,
    visibilityFilter: VisibilityFilter,
    cursor?: PaginationCursor,
    limit?: number,
  ) =>
    orpcRouterClient.initial.requestItemsByVisibility({
      viewId,
      visibilityFilter,
      cursor,
      limit,
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
