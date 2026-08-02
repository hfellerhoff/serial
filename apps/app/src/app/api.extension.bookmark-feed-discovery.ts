import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  BOOKMARK_CAPTURE_LIMITS,
  extensionDiscoveredFeedsSchema,
} from "~/server/bookmarks/contracts";
import { authenticatedExtensionUser } from "~/server/auth/extensionRequest";
import { discoverFeeds as discoverFeedsForUrl } from "~/server/feeds/discovery";
import { captureException } from "~/server/logger";
import {
  extensionPreflightResponse,
  extensionJsonResponse as jsonResponse,
  prepareExtensionJsonRequest,
} from "~/server/http/extensionApi";

const EXTENSION_FEED_DISCOVERY_REQUEST_BYTES = 16 * 1024;

const extensionFeedDiscoveryRequestSchema = z.strictObject({
  sourceUrl: z
    .string()
    .max(BOOKMARK_CAPTURE_LIMITS.urlBytes)
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          (url.protocol === "http:" || url.protocol === "https:") &&
          !url.username &&
          !url.password
        );
      } catch {
        return false;
      }
    }),
});

type ExtensionFeedDiscoveryDependencies = {
  authenticate: typeof authenticatedExtensionUser;
  discover: typeof discoverFeedsForUrl;
};

const DEFAULT_DEPENDENCIES: ExtensionFeedDiscoveryDependencies = {
  authenticate: authenticatedExtensionUser,
  discover: discoverFeedsForUrl,
};

export async function discoverExtensionBookmarkFeeds(
  request: Request,
  dependencies: ExtensionFeedDiscoveryDependencies = DEFAULT_DEPENDENCIES,
) {
  const prepared = await prepareExtensionJsonRequest({
    request,
    maxBytes: EXTENSION_FEED_DISCOVERY_REQUEST_BYTES,
    requestLabel: "Feed discovery",
    authenticate: dependencies.authenticate,
  });
  if (!prepared.ok) return prepared.response;

  const parsedRequest = extensionFeedDiscoveryRequestSchema.safeParse(
    prepared.body,
  );
  if (!parsedRequest.success) {
    return jsonResponse(
      { error: "The Feed discovery request is invalid" },
      400,
    );
  }

  try {
    const discoveredFeeds = await dependencies.discover(
      prepared.user.id,
      parsedRequest.data.sourceUrl,
    );
    const feeds = extensionDiscoveredFeedsSchema.parse(
      discoveredFeeds.map((feed) => ({
        url: feed.url,
        ...(feed.title ? { title: feed.title } : {}),
      })),
    );
    return jsonResponse({ feeds });
  } catch (error) {
    captureException(error, {
      context: "extension-bookmark-feed-discovery",
    });
    return jsonResponse({ error: "Unable to discover Feeds" }, 500);
  }
}

export const Route = createFileRoute("/api/extension/bookmark-feed-discovery")({
  server: {
    handlers: {
      POST: ({ request }) => discoverExtensionBookmarkFeeds(request),
      OPTIONS: () => extensionPreflightResponse(["POST"]),
    },
  },
});
