import { Agent, fetch } from "undici";
import { BOOKMARK_CAPTURE_LIMITS } from "./contracts";
import {
  BlockedCaptureTargetError,
  resolvePublicAddresses,
  validateServerCaptureUrl,
} from "./ssrf";
import type { CaptureFailureReason } from "./contracts";
import type { LookupFunction } from "node:net";

export type StaticHtmlFetchResult =
  | { ok: true; html: string; effectiveUrl: string; redirectCount: number }
  | { ok: false; reason: CaptureFailureReason };

class CaptureTimeoutError extends Error {}
class CaptureTooLargeError extends Error {}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(new CaptureTimeoutError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new CaptureTimeoutError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error("DNS lookup failed"));
      },
    );
  });
}

type CaptureFetchDependencies = {
  resolveAddresses: typeof resolvePublicAddresses;
  createDispatcher: (input: {
    address: string;
    family: 4 | 6;
    hostname: string;
  }) => Agent;
  fetch: typeof fetch;
};

const DEFAULT_FETCH_DEPENDENCIES: CaptureFetchDependencies = {
  resolveAddresses: resolvePublicAddresses,
  createDispatcher: ({ address, family, hostname }) =>
    new Agent({
      connect: {
        lookup: pinnedLookup(address, family),
        servername: hostname,
      },
    }),
  fetch,
};

function pinnedLookup(address: string, family: 4 | 6): LookupFunction {
  return (_hostname, options, callback) => {
    if (typeof options === "object" && options.all) {
      callback(null, [{ address, family }]);
      return;
    }
    callback(null, address, family);
  };
}

async function readBoundedBody(response: Awaited<ReturnType<typeof fetch>>) {
  if (!response.body) return "";
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > BOOKMARK_CAPTURE_LIMITS.fetchedHtmlBytes) {
      throw new CaptureTooLargeError();
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function failureReason(error: unknown): CaptureFailureReason {
  if (error instanceof BlockedCaptureTargetError) return "blocked_target";
  if (
    error instanceof CaptureTimeoutError ||
    (error instanceof Error && error.name === "AbortError")
  ) {
    return "timeout";
  }
  if (error instanceof CaptureTooLargeError) return "too_large";
  return "http_error";
}

export async function fetchStaticHtml(
  sourceUrl: string,
  dependencies: CaptureFetchDependencies = DEFAULT_FETCH_DEPENDENCIES,
): Promise<StaticHtmlFetchResult> {
  const totalController = new AbortController();
  const totalTimeout = setTimeout(
    () => totalController.abort(new CaptureTimeoutError()),
    BOOKMARK_CAPTURE_LIMITS.totalAttemptMs,
  );
  let currentUrl = sourceUrl;

  try {
    for (let redirectCount = 0; ; redirectCount += 1) {
      if (redirectCount > BOOKMARK_CAPTURE_LIMITS.redirects) {
        return { ok: false, reason: "http_error" };
      }

      const target = validateServerCaptureUrl(currentUrl);
      const addresses = await withAbort(
        dependencies.resolveAddresses(target.hostname),
        totalController.signal,
      );
      const pinned = addresses[0]!;
      const dispatcher = dependencies.createDispatcher({
        address: pinned.address,
        family: pinned.family === 6 ? 6 : 4,
        hostname: target.hostname,
      });
      const headersController = new AbortController();
      const headersTimeout = setTimeout(
        () => headersController.abort(new CaptureTimeoutError()),
        BOOKMARK_CAPTURE_LIMITS.responseHeadersMs,
      );

      try {
        const response = await dependencies.fetch(target, {
          dispatcher,
          redirect: "manual",
          signal: AbortSignal.any([
            totalController.signal,
            headersController.signal,
          ]),
          headers: {
            Accept: "text/html, application/xhtml+xml",
            "User-Agent": "Serial page capture",
          },
        });
        clearTimeout(headersTimeout);

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location) return { ok: false, reason: "http_error" };
          currentUrl = new URL(location, target).toString();
          continue;
        }
        if (!response.ok) return { ok: false, reason: "http_error" };

        const contentType = response.headers
          .get("content-type")
          ?.split(";", 1)[0]
          ?.trim()
          .toLowerCase();
        if (
          contentType !== "text/html" &&
          contentType !== "application/xhtml+xml"
        ) {
          return { ok: false, reason: "not_html" };
        }

        const html = await readBoundedBody(response);
        return {
          ok: true,
          html,
          effectiveUrl: target.toString(),
          redirectCount,
        };
      } finally {
        clearTimeout(headersTimeout);
        await dispatcher.close();
      }
    }
  } catch (error) {
    return { ok: false, reason: failureReason(error) };
  } finally {
    clearTimeout(totalTimeout);
  }
}
