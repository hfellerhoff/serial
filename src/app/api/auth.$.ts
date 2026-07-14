import { createFileRoute } from "@tanstack/react-router";
import { auth } from "~/server/auth";
import { isTrustedCorsOrigin } from "~/server/auth/constants";

/**
 * Returns the request's Origin header if it is a trusted cross-origin caller
 * (e.g. the marketing site checking for a session), otherwise null.
 */
function getTrustedCorsOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  return isTrustedCorsOrigin(origin) ? origin : null;
}

function withCorsHeaders(response: Response, request: Request): Response {
  const corsOrigin = getTrustedCorsOrigin(request);
  if (!corsOrigin) return response;

  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", corsOrigin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.append("Vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleAuthRequest(request: Request) {
  const response = await auth.handler(request);
  return withCorsHeaders(response, request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => {
        return handleAuthRequest(request);
      },
      POST: ({ request }) => {
        return handleAuthRequest(request);
      },
      OPTIONS: ({ request }) => {
        // CORS preflight for trusted cross-origin callers.
        return withCorsHeaders(
          new Response(null, {
            status: 204,
            headers: {
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
              "Access-Control-Max-Age": "86400",
            },
          }),
          request,
        );
      },
    },
  },
});
