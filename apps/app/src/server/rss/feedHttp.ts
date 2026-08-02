import { fetch } from "undici";
import { FEED_HTTP_REQUEST_TIMEOUT_MS } from "@serial/bookmark-capture";
import {
  authorizedTestRssOrigin,
  isAuthorizedTestRssUrl,
} from "./testRssOrigin";
import type { Agent } from "undici";
import {
  createPinnedDispatcher,
  resolvePublicAddresses,
  validatePublicHttpUrl,
} from "~/server/http/publicHttp";

export type FeedHttpReadOptions = {
  headers?: HeadersInit;
  method?: "GET" | "HEAD";
  maxBodyBytes?: number;
  maxHeaderBytes?: number;
  maxRedirects?: number;
  totalDurationMs?: number;
};

export type FeedHttpResponse = {
  headers: Headers;
  ok: boolean;
  status: number;
  statusText: string;
  text: string;
  url: string;
};

const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_HEADER_BYTES = 32 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function validateFeedHttpTarget(value: string) {
  if (isAuthorizedTestRssUrl(value)) return new URL(value);
  return validatePublicHttpUrl(value);
}

function resolveFeedHttpAddresses(hostname: string) {
  const fixtureOrigin = authorizedTestRssOrigin();
  if (fixtureOrigin?.hostname === hostname) {
    return Promise.resolve([
      {
        address: fixtureOrigin.hostname === "[::1]" ? "::1" : "127.0.0.1",
        family: fixtureOrigin.hostname === "[::1]" ? 6 : 4,
      },
    ]);
  }
  return resolvePublicAddresses(hostname);
}

type FeedHttpDependencies = {
  validateTarget: typeof validatePublicHttpUrl;
  resolveAddresses: typeof resolvePublicAddresses;
  createDispatcher: (input: {
    address: string;
    family: 4 | 6;
    hostname: string;
  }) => Agent;
  fetch: typeof fetch;
};

const DEFAULT_FEED_HTTP_DEPENDENCIES: FeedHttpDependencies = {
  validateTarget: validateFeedHttpTarget,
  resolveAddresses: resolveFeedHttpAddresses,
  createDispatcher: createPinnedDispatcher,
  fetch,
};

function assertHeadersWithinBudget(headers: Headers, maxHeaderBytes: number) {
  let headerBytes = 0;
  for (const [name, value] of headers) {
    headerBytes += Buffer.byteLength(name) + Buffer.byteLength(value);
    if (headerBytes > maxHeaderBytes) {
      throw new Error(`Feed response headers exceed ${maxHeaderBytes} bytes`);
    }
  }
}

export async function readFeedHttp(
  url: string,
  options: FeedHttpReadOptions = {},
  dependencyOverrides: Partial<FeedHttpDependencies> = {},
): Promise<FeedHttpResponse> {
  const dependencies = {
    ...DEFAULT_FEED_HTTP_DEPENDENCIES,
    ...dependencyOverrides,
  };
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const maxHeaderBytes = options.maxHeaderBytes ?? DEFAULT_MAX_HEADER_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const totalDurationMs =
    options.totalDurationMs ?? FEED_HTTP_REQUEST_TIMEOUT_MS;
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), totalDurationMs);
  let requestUrl = url;

  try {
    for (let redirectCount = 0; ; redirectCount += 1) {
      const target = dependencies.validateTarget(requestUrl);
      const addresses = await dependencies.resolveAddresses(target.hostname);
      const pinned = addresses[0]!;
      const dispatcher = dependencies.createDispatcher({
        address: pinned.address,
        family: pinned.family === 6 ? 6 : 4,
        hostname: target.hostname,
      });

      try {
        const requestHeaders = options.headers
          ? Object.fromEntries(new Headers(options.headers))
          : undefined;
        const response = await dependencies.fetch(target, {
          dispatcher,
          headers: requestHeaders,
          method: options.method ?? "GET",
          redirect: "manual",
          signal: abortController.signal,
        });
        const responseHeaders = new Headers(
          Array.from(response.headers.entries()),
        );
        assertHeadersWithinBudget(responseHeaders, maxHeaderBytes);

        if (REDIRECT_STATUSES.has(response.status)) {
          if (redirectCount >= maxRedirects) {
            await response.body?.cancel();
            const redirectLabel = maxRedirects === 1 ? "redirect" : "redirects";
            throw new Error(
              `Feed request exceeded ${maxRedirects} ${redirectLabel}`,
            );
          }
          const location = response.headers.get("location");
          await response.body?.cancel();
          if (!location) {
            throw new Error("Feed redirect response is missing Location");
          }
          requestUrl = new URL(location, target).toString();
          continue;
        }

        const declaredBodyBytes = Number(
          response.headers.get("content-length"),
        );
        const responseMayHaveBody =
          options.method !== "HEAD" &&
          response.status !== 204 &&
          response.status !== 205 &&
          response.status !== 304;
        if (
          responseMayHaveBody &&
          Number.isFinite(declaredBodyBytes) &&
          declaredBodyBytes > maxBodyBytes
        ) {
          await response.body?.cancel();
          throw new Error(
            `Feed response Content-Length exceeds ${maxBodyBytes} bytes`,
          );
        }
        const reader = responseMayHaveBody
          ? response.body?.getReader()
          : undefined;
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          if (totalBytes > maxBodyBytes) {
            await reader.cancel();
            throw new Error(`Feed response body exceeds ${maxBodyBytes} bytes`);
          }
          chunks.push(value);
        }

        const body = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.byteLength;
        }

        return {
          headers: responseHeaders,
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          text: new TextDecoder().decode(body),
          url: response.url || target.toString(),
        };
      } finally {
        await dispatcher.close();
      }
    }
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error(
        `Feed request exceeded ${totalDurationMs}ms total duration`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
