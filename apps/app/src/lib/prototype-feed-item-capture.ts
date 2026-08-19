import {
  parsePrototypeFeedItemCaptureResponse,
  PROTOTYPE_FEED_ITEM_CAPTURE_REQUEST,
  PROTOTYPE_FEED_ITEM_CAPTURE_RESPONSE,
} from "@serial/bookmark-capture";
import type { PrototypeFeedItemCaptureResponse } from "@serial/bookmark-capture";

const PROTOTYPE_CAPTURE_TIMEOUT_MS = 30_000;

// PROTOTYPE: Sends a one-off in-page request to the Serial extension bridge.
export async function requestPrototypeFeedItemCapture(sourceUrl: string) {
  const requestId = crypto.randomUUID();

  return new Promise<PrototypeFeedItemCaptureResponse>((resolve) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      resolve({
        type: PROTOTYPE_FEED_ITEM_CAPTURE_RESPONSE,
        requestId,
        ok: false,
        error:
          "The Serial extension did not respond. Open this page in the extension-enabled Chrome profile.",
      });
    }, PROTOTYPE_CAPTURE_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleResponse);
    };
    const handleResponse = (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }
      const response = parsePrototypeFeedItemCaptureResponse(
        event.data,
        requestId,
      );
      if (!response) return;
      cleanup();
      resolve(response);
    };

    window.addEventListener("message", handleResponse);
    window.postMessage(
      {
        type: PROTOTYPE_FEED_ITEM_CAPTURE_REQUEST,
        requestId,
        sourceUrl,
      },
      window.location.origin,
    );
  });
}
