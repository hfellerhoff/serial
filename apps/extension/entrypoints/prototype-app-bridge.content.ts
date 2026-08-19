import {
  PROTOTYPE_FEED_ITEM_CAPTURE_RESPONSE,
  isPrototypeFeedItemCaptureRequest,
} from "@serial/bookmark-capture";

// PROTOTYPE: This is the app-to-extension bridge Firefox would also use.
export default defineContentScript({
  matches: [
    "http://localhost/*",
    "http://127.0.0.1/*",
    "https://*.serial.tube/*",
  ],
  main() {
    window.addEventListener("message", (event) => {
      if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        !isPrototypeFeedItemCaptureRequest(event.data)
      ) {
        return;
      }

      const request = event.data;
      void browser.runtime
        .sendMessage(request)
        .then((response: unknown) => {
          window.postMessage(response, window.location.origin);
        })
        .catch((error: unknown) => {
          window.postMessage(
            {
              type: PROTOTYPE_FEED_ITEM_CAPTURE_RESPONSE,
              requestId: request.requestId,
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Unable to contact the Serial extension",
            },
            window.location.origin,
          );
        });
    });
  },
});
