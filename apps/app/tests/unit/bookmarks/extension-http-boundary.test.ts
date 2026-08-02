import { describe, expect, it, vi } from "vitest";

import {
  extensionPreflightResponse,
  prepareExtensionJsonRequest,
} from "~/server/http/extensionApi";

const REQUEST_LABELS = ["bookmark", "feed"] as const;
type Authenticator = () => Promise<{ id: string } | null>;

function jsonRequest(
  body: BodyInit = "{}",
  headers: Record<string, string> = {},
) {
  return new Request("https://serial.example/api/extension/resource", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

async function prepare(
  requestLabel: (typeof REQUEST_LABELS)[number],
  request: Request,
  authenticate: Authenticator = vi.fn(() =>
    Promise.resolve({ id: "user-one" }),
  ),
) {
  return {
    authenticate,
    result: await prepareExtensionJsonRequest({
      request,
      maxBytes: 32,
      requestLabel,
      authenticate,
    }),
  };
}

describe.each(REQUEST_LABELS)(
  "shared extension %s HTTP boundary",
  (requestLabel) => {
    it.each([
      {
        name: "content encoding",
        request: () => jsonRequest("{}", { "Content-Encoding": "gzip" }),
        status: 415,
        error: "Request content encodings are not allowed",
      },
      {
        name: "non-JSON media type",
        request: () =>
          new Request("https://serial.example/api/extension/resource", {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: "{}",
          }),
        status: 415,
        error: "Content-Type must be application/json",
      },
      {
        name: "declared oversized body",
        request: () => jsonRequest("{}", { "Content-Length": "33" }),
        status: 413,
        error: `The ${requestLabel} request is too large`,
      },
      {
        name: "streamed oversized body",
        request: () => jsonRequest("x".repeat(33)),
        status: 413,
        error: `The ${requestLabel} request is too large`,
      },
      {
        name: "invalid JSON",
        request: () => jsonRequest("{"),
        status: 400,
        error: `The ${requestLabel} request is invalid`,
      },
    ])("handles $name identically", async ({ request, status, error }) => {
      const { result } = await prepare(requestLabel, request());

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.response.status).toBe(status);
      expect(result.response.headers.get("cache-control")).toBe("no-store");
      expect(result.response.headers.get("access-control-allow-origin")).toBe(
        "*",
      );
      await expect(result.response.json()).resolves.toEqual({ error });
    });

    it("rejects an invalid session before reading the body", async () => {
      const authenticate = vi.fn(() => Promise.resolve(null));
      const { result } = await prepare(
        requestLabel,
        jsonRequest("{"),
        authenticate,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toEqual({
        error: "The extension session is invalid",
      });
    });

    it("returns the authenticated user and parsed JSON", async () => {
      const { result } = await prepare(
        requestLabel,
        jsonRequest(JSON.stringify({ value: requestLabel })),
      );

      expect(result).toMatchObject({
        ok: true,
        user: { id: "user-one" },
        body: { value: requestLabel },
      });
    });
  },
);

it("builds a credential-free shared extension preflight response", () => {
  const response = extensionPreflightResponse(["POST", "PATCH"]);

  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  expect(response.headers.get("access-control-allow-methods")).toBe(
    "POST, PATCH, OPTIONS",
  );
  expect(response.headers.get("access-control-allow-headers")).toBe(
    "Authorization, Content-Type",
  );
});
