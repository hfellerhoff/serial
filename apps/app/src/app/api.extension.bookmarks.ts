import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { readExtensionBearerToken } from "~/lib/extension-auth";
import {
  BOOKMARK_CAPTURE_LIMITS,
  EXTENSION_BOOKMARK_CONTRACT_VERSION,
  extensionCaptureCandidateSchema,
} from "~/server/bookmarks/contracts";
import {
  BookmarkNotFoundError,
  saveBookmarkFromExtension,
} from "~/server/bookmarks/service";
import { InvalidBookmarkUrlError } from "~/server/bookmarks/url";
import { findExtensionSession } from "~/server/auth/extension";
import { db } from "~/server/db";
import { user } from "~/server/db/schema";
import {
  publishBookmarkDeletion,
  publishBookmarkUpsert,
} from "~/server/mixed-content/sync";

const RESPONSE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
} as const;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

export function preflightResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      ...RESPONSE_HEADERS,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
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

async function authenticatedExtensionUser(request: Request) {
  const token = readExtensionBearerToken(request);
  if (!token) return null;
  const session = await findExtensionSession(token);
  if (!session) return null;
  const storedUser = await db.query.user.findFirst({
    where: eq(user.id, session.userId),
  });
  if (!storedUser) return null;
  const activeBan =
    storedUser.banned &&
    (!storedUser.banExpires || storedUser.banExpires.getTime() > Date.now());
  return activeBan ? null : storedUser;
}

type ExtensionBookmarkRouteDependencies = {
  authenticate: typeof authenticatedExtensionUser;
  save: typeof saveBookmarkFromExtension;
  notify?: (
    userId: string,
    result: Awaited<ReturnType<typeof saveBookmarkFromExtension>>,
  ) => Promise<void>;
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
    await publishBookmarkUpsert({
      database: db,
      userId,
      bookmarkId: result.bookmark.id,
    });
  },
};

const extensionBookmarkRequestSchema = z.strictObject({
  contractVersion: z.literal(EXTENSION_BOOKMARK_CONTRACT_VERSION),
  sourceUrl: z.string(),
  bookmarkId: z.string().min(1).optional(),
  capture: extensionCaptureCandidateSchema,
});

export async function saveExtensionBookmark(
  request: Request,
  dependencies: ExtensionBookmarkRouteDependencies = DEFAULT_ROUTE_DEPENDENCIES,
) {
  if (request.headers.has("content-encoding")) {
    return jsonResponse(
      { error: "Request content encodings are not allowed" },
      415,
    );
  }
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0];
  if (mediaType?.trim().toLowerCase() !== "application/json") {
    return jsonResponse(
      { error: "Content-Type must be application/json" },
      415,
    );
  }

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
    });
    await dependencies.notify?.(authenticatedUser.id, result);
    return jsonResponse(result, result.disposition === "created" ? 201 : 200);
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

export const Route = createFileRoute("/api/extension/bookmarks")({
  server: {
    handlers: {
      POST: ({ request }) => saveExtensionBookmark(request),
      OPTIONS: () => preflightResponse(),
    },
  },
});
