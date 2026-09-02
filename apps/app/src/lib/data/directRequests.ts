"use client";

import { orpc, orpcRouterClient } from "../orpc";
import { getQueryClient } from "../query-client";
import { feedsStore } from "./feeds/store";
import {
  getMixedContentMembershipRevision,
  isMixedContentMembershipRevisionStale,
} from "./mixed-content/membershipRevision";
import { loadingActor } from "./loading-machine";
import { dataReconciliation } from "./reconciliation";
import { applyRequestedMixedContentPage } from "./subscriptionCoordinator";
import { feedItemsStore } from "./store";
import { viewsStore } from "./views/store";
import type { ContentStatusFilter } from "~/lib/content-status";
import type { ImportProgressChunk } from "~/server/api/routers/initialRouter";

export function applyImportProgressChunk(chunk: ImportProgressChunk) {
  switch (chunk.type) {
    case "import-start":
      feedItemsStore.setState({ hasInitialData: true, feedStatusDict: {} });
      loadingActor.send({
        type: "IMPORT_START",
        totalFeeds: chunk.totalFeeds,
      });
      break;
    case "import-limit-warning":
      loadingActor.send({
        type: "IMPORT_LIMIT_WARNING",
        deactivatedCount: chunk.deactivatedCount,
        maxActiveFeeds: chunk.maxActiveFeeds,
      });
      break;
    case "import-feed-inserted":
      feedsStore.getState().add(chunk.feed);
      break;
    case "import-feed-error":
      console.error(`Import error for ${chunk.feedUrl}: ${chunk.error}`);
      loadingActor.send({ type: "IMPORT_FEED_ERROR", feedUrl: chunk.feedUrl });
      break;
    case "import-views-updated":
      viewsStore.getState().set(chunk.views);
      // Leave an in-flight fetch's status alone so its re-entry guard holds
      // and its resolution path stays responsible for the final status.
      if (viewsStore.getState().fetchStatus !== "fetching") {
        viewsStore.setState({ fetchStatus: "success" });
      }
      break;
    case "feed-status":
      feedItemsStore.setState({
        feedStatusDict: {
          ...feedItemsStore.getState().feedStatusDict,
          [chunk.feedId]: chunk.status,
        },
      });
      loadingActor.send({ type: "FEED_STATUS" });
      break;
  }
}

export const dataRequestActions = {
  requestMixedContentPage: (
    scope: Parameters<
      typeof orpcRouterClient.mixedContent.requestPage
    >[0]["scope"],
    contentStatus: ContentStatusFilter,
    cursor?: Parameters<
      typeof orpcRouterClient.mixedContent.requestPage
    >[0]["cursor"],
    limit?: number,
  ) => {
    const membershipRevision = getMixedContentMembershipRevision();
    return orpcRouterClient.mixedContent
      .requestPage({ scope, contentStatus, cursor, limit })
      .then((page) => {
        if (isMixedContentMembershipRevisionStale(membershipRevision)) {
          return page;
        }
        applyRequestedMixedContentPage({
          scope,
          contentStatus,
          page,
          replacesScope: !cursor,
        });
        return page;
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
  ) =>
    orpcRouterClient.initial.streamingImport({ feeds }).then(async (stream) => {
      try {
        for await (const chunk of stream) applyImportProgressChunk(chunk);
      } finally {
        loadingActor.send({ type: "IMPORT_COMPLETE" });
        // The imported views land in the store via import-views-updated
        // chunks, but their first content pages only load through a full
        // reconciliation — and the SSE invalidations alone leave that to a
        // later repair (or a reconnect if the connection dropped). Request it
        // directly so the new views become browsable right away.
        dataReconciliation.requestManualFull().catch(() => {
          // A superseded or failed full sync will be retried by the runtime.
        });
        await getQueryClient().invalidateQueries({
          queryKey: orpc.subscription.getStatus.queryOptions().queryKey,
        });
      }
    }),
};
