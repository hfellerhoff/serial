import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  BOOKMARK_CAPTURE_LIMITS,
  EXTENSION_BOOKMARK_CONTRACT_VERSION,
  EXTENSION_CAPTURE_FAILURE_REASONS,
  extensionCaptureCandidateSchema,
  extensionDiscoveredFeedsSchema,
} from "~/server/bookmarks/contracts";
import {
  BookmarkNotFoundError,
  deleteBookmark,
  saveBookmarkFromExtension,
  setBookmarkTag,
  setBookmarkView,
} from "~/server/bookmarks/service";
import { InvalidBookmarkUrlError } from "~/server/bookmarks/url";
import { authenticatedExtensionUser } from "~/server/auth/extensionRequest";
import { db } from "~/server/db";
import { loadExtensionBookmarkWorkspace } from "~/server/bookmarks/extensionWorkspace";
import {
  createExtensionBookmarkTag,
  createExtensionBookmarkView,
} from "~/server/bookmarks/extensionOrganization";
import {
  publishBookmarkDeletion,
  publishBookmarkUpsert,
} from "~/server/mixed-content/sync";
import { discoverFeeds as discoverFeedsForUrl } from "~/server/feeds/discovery";
import { captureException } from "~/server/logger";

const RESPONSE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
} as const;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

function jsonMediaTypeError(request: Request) {
  if (request.headers.has("content-encoding")) {
    return jsonResponse(
      { error: "Request content encodings are not allowed" },
      415,
    );
  }
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0];
  return mediaType?.trim().toLowerCase() === "application/json"
    ? null
    : jsonResponse({ error: "Content-Type must be application/json" }, 415);
}

export function preflightResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      ...RESPONSE_HEADERS,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}

async function readBoundedJson(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > BOOKMARK_CAPTURE_LIMITS.extensionRequestBytes
  ) {
    throw new RangeError("request_too_large");
  }
  if (!request.body) throw new SyntaxError("invalid_json");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    bytes += result.value.byteLength;
    if (bytes > BOOKMARK_CAPTURE_LIMITS.extensionRequestBytes) {
      await reader.cancel();
      throw new RangeError("request_too_large");
    }
    chunks.push(result.value);
  }

  const value = new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.concat(chunks),
  );
  return JSON.parse(value);
}

type ExtensionBookmarkRouteDependencies = {
  authenticate: typeof authenticatedExtensionUser;
  save: typeof saveBookmarkFromExtension;
  notify?: (
    userId: string,
    result: Awaited<ReturnType<typeof saveBookmarkFromExtension>>,
  ) => ReturnType<typeof publishBookmarkUpsert>;
  workspace?: typeof loadExtensionBookmarkWorkspace;
  discover?: typeof discoverFeedsForUrl;
};

const DEFAULT_ROUTE_DEPENDENCIES: ExtensionBookmarkRouteDependencies = {
  authenticate: authenticatedExtensionUser,
  save: saveBookmarkFromExtension,
  notify: async (userId, result) => {
    const removedBookmarkIds =
      result.removedBookmarkIds ??
      (result.removedBookmarkId ? [result.removedBookmarkId] : []);
    await Promise.all(
      removedBookmarkIds.map((removedBookmarkId) =>
        publishBookmarkDeletion({
          userId,
          id: removedBookmarkId,
          canonicalUrl: result.bookmark.canonicalUrl,
        }),
      ),
    );
    return publishBookmarkUpsert({
      database: db,
      userId,
      bookmarkId: result.bookmark.id,
    });
  },
  workspace: loadExtensionBookmarkWorkspace,
  discover: discoverFeedsForUrl,
};

const extensionBookmarkRequestSchema = z.strictObject({
  contractVersion: z.literal(EXTENSION_BOOKMARK_CONTRACT_VERSION),
  sourceUrl: z.string(),
  bookmarkId: z.string().min(1).optional(),
  capture: extensionCaptureCandidateSchema,
  captureFailureReason: z.enum(EXTENSION_CAPTURE_FAILURE_REASONS).optional(),
  feeds: extensionDiscoveredFeedsSchema.optional().default([]),
});

export async function saveExtensionBookmark(
  request: Request,
  dependencies: ExtensionBookmarkRouteDependencies = DEFAULT_ROUTE_DEPENDENCIES,
) {
  const mediaTypeError = jsonMediaTypeError(request);
  if (mediaTypeError) return mediaTypeError;

  const authenticatedUser = await dependencies.authenticate(request);
  if (!authenticatedUser) {
    return jsonResponse({ error: "The extension session is invalid" }, 401);
  }

  try {
    const rawBody = await readBoundedJson(request);
    const parsedRequest = extensionBookmarkRequestSchema.safeParse(rawBody);
    if (!parsedRequest.success) {
      return jsonResponse({ error: "The bookmark request is invalid" }, 400);
    }
    const bookmarkRequest = parsedRequest.data;
    const result = await dependencies.save({
      database: db,
      userId: authenticatedUser.id,
      sourceUrl: bookmarkRequest.sourceUrl,
      bookmarkId: bookmarkRequest.bookmarkId,
      capture: bookmarkRequest.capture,
      captureFailureReason: bookmarkRequest.captureFailureReason,
    });
    const discoveredFeeds =
      bookmarkRequest.feeds.length > 0
        ? bookmarkRequest.feeds
        : await (dependencies.discover ?? discoverFeedsForUrl)(
            authenticatedUser.id,
            bookmarkRequest.sourceUrl,
          ).catch((error) => {
            captureException(error, {
              context: "extension-bookmark-feed-discovery",
              url: bookmarkRequest.sourceUrl,
            });
            return [];
          });
    const publishedBookmark = await dependencies.notify?.(
      authenticatedUser.id,
      result,
    );
    const workspace = await dependencies.workspace?.({
      database: db,
      userId: authenticatedUser.id,
      bookmarkId: result.bookmark.id,
      ...(publishedBookmark ? { bookmark: publishedBookmark } : {}),
    });
    return jsonResponse(
      workspace
        ? {
            ...result,
            feeds: discoveredFeeds,
            bookmark: workspace.bookmark,
            workspace: {
              views: workspace.views,
              tags: workspace.tags,
            },
          }
        : { ...result, feeds: discoveredFeeds },
      result.disposition === "created" ? 201 : 200,
    );
  } catch (error) {
    if (error instanceof RangeError) {
      return jsonResponse({ error: "The bookmark request is too large" }, 413);
    }
    if (error instanceof SyntaxError || error instanceof TypeError) {
      return jsonResponse({ error: "The bookmark request is invalid" }, 400);
    }
    if (error instanceof InvalidBookmarkUrlError) {
      return jsonResponse({ error: "The bookmark URL is invalid" }, 400);
    }
    if (error instanceof BookmarkNotFoundError) {
      return jsonResponse({ error: "The Bookmark was not found" }, 404);
    }
    return jsonResponse({ error: "Unable to save the bookmark" }, 500);
  }
}

const extensionBookmarkMutationSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("set-view"),
    bookmarkId: z.string().min(1),
    viewId: z.number().int().positive(),
    assigned: z.boolean(),
  }),
  z.strictObject({
    action: z.literal("set-tag"),
    bookmarkId: z.string().min(1),
    tagId: z.number().int().positive(),
    assigned: z.boolean(),
  }),
  z.strictObject({
    action: z.literal("create-view"),
    bookmarkId: z.string().min(1),
    name: z.string().trim().min(1).max(256),
  }),
  z.strictObject({
    action: z.literal("create-tag"),
    bookmarkId: z.string().min(1),
    name: z.string().trim().min(2).max(256),
  }),
]);

type ExtensionBookmarkMutationDependencies = {
  authenticate: typeof authenticatedExtensionUser;
  setView: typeof setBookmarkView;
  setTag: typeof setBookmarkTag;
  createView: typeof createExtensionBookmarkView;
  createTag: typeof createExtensionBookmarkTag;
  publish: typeof publishBookmarkUpsert;
};

const DEFAULT_MUTATION_DEPENDENCIES: ExtensionBookmarkMutationDependencies = {
  authenticate: authenticatedExtensionUser,
  setView: setBookmarkView,
  setTag: setBookmarkTag,
  createView: createExtensionBookmarkView,
  createTag: createExtensionBookmarkTag,
  publish: publishBookmarkUpsert,
};

export async function mutateExtensionBookmark(
  request: Request,
  dependencies: ExtensionBookmarkMutationDependencies = DEFAULT_MUTATION_DEPENDENCIES,
) {
  const mediaTypeError = jsonMediaTypeError(request);
  if (mediaTypeError) return mediaTypeError;
  const authenticatedUser = await dependencies.authenticate(request);
  if (!authenticatedUser) {
    return jsonResponse({ error: "The extension session is invalid" }, 401);
  }
  try {
    const mutation = extensionBookmarkMutationSchema.parse(
      await readBoundedJson(request),
    );
    let createdOption:
      | {
          kind: "view";
          option: Awaited<ReturnType<typeof createExtensionBookmarkView>>;
        }
      | {
          kind: "tag";
          option: Awaited<ReturnType<typeof createExtensionBookmarkTag>>;
        }
      | undefined;
    if (mutation.action === "set-view") {
      await dependencies.setView({
        database: db,
        userId: authenticatedUser.id,
        bookmarkId: mutation.bookmarkId,
        viewId: mutation.viewId,
        assigned: mutation.assigned,
      });
    } else if (mutation.action === "set-tag") {
      await dependencies.setTag({
        database: db,
        userId: authenticatedUser.id,
        bookmarkId: mutation.bookmarkId,
        tagId: mutation.tagId,
        assigned: mutation.assigned,
      });
    } else if (mutation.action === "create-view") {
      const option = await dependencies.createView({
        database: db,
        userId: authenticatedUser.id,
        bookmarkId: mutation.bookmarkId,
        name: mutation.name,
      });
      await dependencies.setView({
        database: db,
        userId: authenticatedUser.id,
        bookmarkId: mutation.bookmarkId,
        viewId: option.id,
        assigned: true,
      });
      createdOption = { kind: "view", option };
    } else {
      const option = await dependencies.createTag({
        database: db,
        userId: authenticatedUser.id,
        bookmarkId: mutation.bookmarkId,
        name: mutation.name,
      });
      await dependencies.setTag({
        database: db,
        userId: authenticatedUser.id,
        bookmarkId: mutation.bookmarkId,
        tagId: option.id,
        assigned: true,
      });
      createdOption = { kind: "tag", option };
    }
    const bookmark = await dependencies.publish({
      database: db,
      userId: authenticatedUser.id,
      bookmarkId: mutation.bookmarkId,
    });
    if (!bookmark) throw new BookmarkNotFoundError("Bookmark not found");
    return jsonResponse({
      bookmark,
      ...(createdOption ? { createdOption } : {}),
    });
  } catch (error) {
    if (error instanceof RangeError) {
      return jsonResponse({ error: "The bookmark request is too large" }, 413);
    }
    if (error instanceof BookmarkNotFoundError) {
      return jsonResponse({ error: "The Bookmark was not found" }, 404);
    }
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      error instanceof TypeError
    ) {
      return jsonResponse({ error: "The bookmark request is invalid" }, 400);
    }
    return jsonResponse({ error: "Unable to update the Bookmark" }, 500);
  }
}

const extensionBookmarkDeleteSchema = z.strictObject({
  bookmarkId: z.string().min(1),
});

type ExtensionBookmarkRemovalDependencies = {
  authenticate: typeof authenticatedExtensionUser;
  remove: typeof deleteBookmark;
  publish: typeof publishBookmarkDeletion;
};

const DEFAULT_REMOVAL_DEPENDENCIES: ExtensionBookmarkRemovalDependencies = {
  authenticate: authenticatedExtensionUser,
  remove: deleteBookmark,
  publish: publishBookmarkDeletion,
};

export async function removeExtensionBookmark(
  request: Request,
  dependencies: ExtensionBookmarkRemovalDependencies = DEFAULT_REMOVAL_DEPENDENCIES,
) {
  const mediaTypeError = jsonMediaTypeError(request);
  if (mediaTypeError) return mediaTypeError;
  const authenticatedUser = await dependencies.authenticate(request);
  if (!authenticatedUser) {
    return jsonResponse({ error: "The extension session is invalid" }, 401);
  }
  try {
    const input = extensionBookmarkDeleteSchema.parse(
      await readBoundedJson(request),
    );
    const deleted = await dependencies.remove({
      database: db,
      userId: authenticatedUser.id,
      bookmarkId: input.bookmarkId,
    });
    await dependencies.publish({
      userId: authenticatedUser.id,
      id: deleted.id,
      canonicalUrl: deleted.canonicalUrl,
    });
    return jsonResponse({ bookmarkId: deleted.id });
  } catch (error) {
    if (error instanceof RangeError) {
      return jsonResponse({ error: "The bookmark request is too large" }, 413);
    }
    if (error instanceof BookmarkNotFoundError) {
      return jsonResponse({ error: "The Bookmark was not found" }, 404);
    }
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      error instanceof TypeError
    ) {
      return jsonResponse({ error: "The bookmark request is invalid" }, 400);
    }
    return jsonResponse({ error: "Unable to remove the Bookmark" }, 500);
  }
}

export const Route = createFileRoute("/api/extension/bookmarks")({
  server: {
    handlers: {
      POST: ({ request }) => saveExtensionBookmark(request),
      PATCH: ({ request }) => mutateExtensionBookmark(request),
      DELETE: ({ request }) => removeExtensionBookmark(request),
      OPTIONS: () => preflightResponse(),
    },
  },
});
