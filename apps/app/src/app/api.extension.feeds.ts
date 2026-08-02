import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticatedExtensionUser } from "~/server/auth/extensionRequest";
import { createFeedsForUser } from "~/server/feeds/create";
import { db } from "~/server/db";

const RESPONSE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
} as const;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

const extensionFeedRequestSchema = z.strictObject({
  url: z.url(),
});
const EXTENSION_FEED_REQUEST_BYTES = 16 * 1024;

async function readBoundedFeedJson(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > EXTENSION_FEED_REQUEST_BYTES
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
    if (bytes > EXTENSION_FEED_REQUEST_BYTES) {
      await reader.cancel();
      throw new RangeError("request_too_large");
    }
    chunks.push(result.value);
  }
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
  );
}

export async function addExtensionFeed(request: Request) {
  const authenticatedUser = await authenticatedExtensionUser(request);
  if (!authenticatedUser) {
    return jsonResponse({ error: "The extension session is invalid" }, 401);
  }
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
  try {
    const input = extensionFeedRequestSchema.parse(
      await readBoundedFeedJson(request),
    );
    const result = await createFeedsForUser({
      database: db,
      userId: authenticatedUser.id,
      url: input.url,
      categoryIds: [],
      viewIds: [],
    });
    return jsonResponse(result, 201);
  } catch (error) {
    if (error instanceof RangeError) {
      return jsonResponse({ error: "The feed request is too large" }, 413);
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
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
      OPTIONS: () =>
        new Response(null, {
          status: 204,
          headers: {
            ...RESPONSE_HEADERS,
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Max-Age": "86400",
          },
        }),
    },
  },
});
