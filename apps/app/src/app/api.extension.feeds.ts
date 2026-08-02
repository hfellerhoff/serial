import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticatedExtensionUser } from "~/server/auth/extensionRequest";
import { createFeedsForUser } from "~/server/feeds/create";
import { db } from "~/server/db";
import { fetchAndInsertFeedData } from "~/server/rss/fetchFeeds";
import { captureException } from "~/server/logger";
import {
  extensionPreflightResponse,
  extensionJsonResponse as jsonResponse,
  prepareExtensionJsonRequest,
} from "~/server/http/extensionApi";

const extensionFeedRequestSchema = z.strictObject({
  url: z.url(),
});
const EXTENSION_FEED_REQUEST_BYTES = 16 * 1024;

export async function addExtensionFeed(request: Request) {
  const prepared = await prepareExtensionJsonRequest({
    request,
    maxBytes: EXTENSION_FEED_REQUEST_BYTES,
    requestLabel: "feed",
    authenticate: authenticatedExtensionUser,
  });
  if (!prepared.ok) return prepared.response;
  const authenticatedUser = prepared.user;
  try {
    const input = extensionFeedRequestSchema.parse(prepared.body);
    const result = await createFeedsForUser({
      database: db,
      userId: authenticatedUser.id,
      url: input.url,
      categoryIds: [],
      viewIds: [],
      returnExisting: true,
    });
    try {
      for await (const ingestionResult of fetchAndInsertFeedData(
        { db },
        result.feeds,
      )) {
        void ingestionResult;
      }
    } catch (error) {
      captureException(error, {
        context: "extension-feed-initial-ingestion",
        url: input.url,
      });
    }
    return jsonResponse(result, result.createdCount === 0 ? 200 : 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: "The feed request is invalid" }, 400);
    }
    const message =
      error instanceof Error ? error.message : "Unable to add feed";
    if (message === "Feed already exists") {
      return jsonResponse({ error: message }, 409);
    }
    return jsonResponse({ error: "Unable to add the Feed" }, 400);
  }
}

export const Route = createFileRoute("/api/extension/feeds")({
  server: {
    handlers: {
      POST: ({ request }) => addExtensionFeed(request),
      OPTIONS: () => extensionPreflightResponse(["POST"]),
    },
  },
});
