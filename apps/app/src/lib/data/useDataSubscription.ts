"use client";

import { useCallback, useEffect, useRef } from "react";
import { getDefaultStore } from "jotai";
import { orpcRouterClient } from "../orpc";
import { combineAbortSignals } from "./combineAbortSignals";
import { loadingActor } from "./loading-machine";
import { shouldAlwaysKeepSSEConnectionAlive } from "./atoms";
import {
  initializeDataSubscriptionConnection,
  markDataSubscriptionConnected,
  markDataSubscriptionFailed,
  markDataSubscriptionPaused,
} from "./subscriptionConnection";
import { dataReconciliation } from "./reconciliation";
import type { PublishedChunk } from "~/server/api/publisher";

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
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryDelayRef = useRef(INITIAL_RETRY_DELAY);

  // Buffer chunks and flush via requestAnimationFrame for micro-batching
  const chunkBufferRef = useRef<PublishedChunk[]>([]);
  const rafIdRef = useRef<number | null>(null);

  const flushBuffer = useCallback(() => {
    rafIdRef.current = null;
    const chunks = chunkBufferRef.current;
    if (chunks.length === 0) return;
    chunkBufferRef.current = [];
    dataReconciliation.receivePublishedChunks(chunks);
  }, []);

  // Cleanup aborts the stream and removes both direct subscriptions. The
  // subscription loop also combines its connection signal with this abort.
  // oxlint-disable-next-line react-doctor/effect-needs-cleanup
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    abortControllerRef.current = controller;
    initializeDataSubscriptionConnection(navigator.onLine !== false);

    // Per-connection controller — aborted on visibility change to force
    // a reconnect without tearing down the entire subscription lifecycle.
    let connectionController: AbortController | null = null;
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
          retryDelayRef.current = INITIAL_RETRY_DELAY;

          // Each reconnect depends on the prior connection closing.
          // oxlint-disable-next-line react-doctor/async-await-in-loop
          const iterator = await orpcRouterClient.initial.subscribe(
            {},
            { signal: connectionSignal },
          );
          markDataSubscriptionConnected();
          dataReconciliation.sseConnectionChanged(true);

          for await (const payload of iterator as AsyncIterable<PublishedChunk>) {
            if (conn.signal.aborted) break;

            // Buffer the chunk and schedule a flush via RAF
            chunkBufferRef.current.push(payload);
            if (rafIdRef.current === null) {
              rafIdRef.current = requestAnimationFrame(flushBuffer);
            }
          }
          if (!conn.signal.aborted && !signal.aborted) {
            markDataSubscriptionFailed({
              isOnline: navigator.onLine !== false,
              isVisible: document.visibilityState === "visible",
            });
          }
        } catch (error) {
          dataReconciliation.sseConnectionChanged(false);
          dataReconciliation.subscriptionAttemptFailed();

          if (controller.signal.aborted) break;

          // Skip backoff for visibility-triggered reconnects
          if (conn.signal.aborted) {
            markDataSubscriptionPaused();
            continue;
          }

          markDataSubscriptionFailed({
            isOnline: navigator.onLine !== false,
            isVisible: document.visibilityState === "visible",
          });

          console.error("Subscription error, retrying...", error);

          // Wait with exponential backoff before retrying
          await waitForAbortableDelay(retryDelayRef.current, controller.signal);

          // Increase retry delay for next attempt
          retryDelayRef.current = Math.min(
            retryDelayRef.current * BACKOFF_MULTIPLIER,
            MAX_RETRY_DELAY,
          );
        } finally {
          markDataSubscriptionPaused();
          dataReconciliation.sseConnectionChanged(false);
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
      dataReconciliation.environmentChanged();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const handleOnline = () => dataReconciliation.environmentChanged();
    const handleOffline = () => {
      markDataSubscriptionFailed({
        isOnline: false,
        isVisible: document.visibilityState === "visible",
      });
      dataReconciliation.environmentChanged();
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

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
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubscribeAtom();
      controller.abort();
      markDataSubscriptionPaused();
      dataReconciliation.sseConnectionChanged(false);
      // Cancel any pending RAF flush
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      // Flush remaining chunks synchronously on unmount
      if (chunkBufferRef.current.length > 0) {
        dataReconciliation.receivePublishedChunks(chunkBufferRef.current);
        chunkBufferRef.current = [];
      }
    };
  }, [flushBuffer]);
}
