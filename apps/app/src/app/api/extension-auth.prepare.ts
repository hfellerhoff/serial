import { createFileRoute } from "@tanstack/react-router";
import type { RateLimitResult } from "~/server/rate-limit";
import {
  SERIAL_EXTENSION_AUTH_SCOPES,
  SERIAL_EXTENSION_CLIENT_ID,
} from "~/server/auth/extension";
import { getAuthIssuer } from "~/server/auth/base-url";
import { AUTH_BASE_URL_CONFIG } from "~/server/auth/constants";
import {
  getAllowedExtensionRedirectUris,
  getExtensionPrepareOrigin,
} from "~/server/auth/extension-origin";
import { db } from "~/server/db";
import { user } from "~/server/db/schema";
import { logError } from "~/server/logger";
import { checkIpRateLimit } from "~/server/rate-limit";

const MAX_PREPARE_BODY_BYTES = 1_024;
const PREPARE_RATE_LIMIT = 20;
const PREPARE_RATE_LIMIT_WINDOW_SECONDS = 60;

class InvalidPrepareRequestError extends Error {}
class PrepareBodyTooLargeError extends Error {}

function corsResponse(
  request: Request,
  body: BodyInit | null,
  init: ResponseInit = {},
) {
  const headers = new Headers(init.headers);
  const origin = getExtensionPrepareOrigin(request);
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.append("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Cache-Control", "no-store");
  return new Response(body, { ...init, headers });
}

function jsonResponse(
  request: Request,
  body: Record<string, unknown>,
  status = 200,
  headers?: HeadersInit,
) {
  return corsResponse(request, JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

function rateLimitHeaders(result: RateLimitResult) {
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(result.retryAfter),
  };
}

async function readLimitedJson(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_PREPARE_BODY_BYTES
  ) {
    throw new PrepareBodyTooLargeError();
  }
  if (!request.body) throw new InvalidPrepareRequestError();

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > MAX_PREPARE_BODY_BYTES) {
      await reader.cancel();
      throw new PrepareBodyTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();

  try {
    return JSON.parse(text);
  } catch {
    throw new InvalidPrepareRequestError();
  }
}

export const Route = createFileRoute("/api/extension-auth/prepare")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestOrigin = request.headers.get("origin");
        if (requestOrigin && !getExtensionPrepareOrigin(request)) {
          return jsonResponse(
            request,
            { error: "Extension authentication request origin is not allowed" },
            403,
          );
        }

        const rateLimit = await checkIpRateLimit(request, {
          namespace: "extension-auth:prepare",
          limit: PREPARE_RATE_LIMIT,
          windowSeconds: PREPARE_RATE_LIMIT_WINDOW_SECONDS,
        });
        const limitHeaders = rateLimitHeaders(rateLimit);
        if (!rateLimit.allowed) {
          return jsonResponse(
            request,
            { error: "Too many extension authentication requests" },
            429,
            {
              ...limitHeaders,
              "Retry-After": String(rateLimit.retryAfter),
            },
          );
        }

        let body: unknown;
        try {
          body = await readLimitedJson(request);
        } catch (error) {
          return jsonResponse(
            request,
            {
              error:
                error instanceof PrepareBodyTooLargeError
                  ? "Extension authentication request is too large"
                  : "Invalid extension authentication request",
            },
            error instanceof PrepareBodyTooLargeError ? 413 : 400,
            limitHeaders,
          );
        }

        const redirectUri =
          body &&
          typeof body === "object" &&
          "redirectUri" in body &&
          typeof body.redirectUri === "string"
            ? body.redirectUri
            : null;
        if (
          !redirectUri ||
          !getAllowedExtensionRedirectUris().includes(redirectUri)
        ) {
          return jsonResponse(
            request,
            { error: "This extension redirect URL is not registered" },
            400,
            limitHeaders,
          );
        }

        try {
          const existingUser = await db
            .select({ id: user.id })
            .from(user)
            .limit(1)
            .get();
          if (!existingUser) {
            return jsonResponse(
              request,
              {
                error:
                  "Finish setting up this Serial instance and sign in there before connecting the extension",
              },
              409,
              limitHeaders,
            );
          }
        } catch (error) {
          logError(
            "[extension-auth] Unable to check instance readiness:",
            error,
          );
          return jsonResponse(
            request,
            { error: "Unable to prepare extension authentication" },
            500,
            limitHeaders,
          );
        }

        const issuer = getAuthIssuer(request, AUTH_BASE_URL_CONFIG);
        return jsonResponse(
          request,
          {
            issuer,
            clientId: SERIAL_EXTENSION_CLIENT_ID,
            scopes: SERIAL_EXTENSION_AUTH_SCOPES,
            authorizationEndpoint: `${issuer}/oauth2/authorize`,
            tokenEndpoint: `${issuer}/oauth2/token`,
            revocationEndpoint: `${issuer}/oauth2/revoke`,
            userInfoEndpoint: `${issuer}/oauth2/userinfo`,
            redirectUri,
          },
          200,
          limitHeaders,
        );
      },
      OPTIONS: ({ request }) => {
        if (!getExtensionPrepareOrigin(request)) {
          return new Response(null, { status: 403 });
        }
        return corsResponse(request, null, { status: 204 });
      },
    },
  },
});
