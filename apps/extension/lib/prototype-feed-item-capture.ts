import {
  PROTOTYPE_FEED_ITEM_CAPTURE_RESPONSE,
  type PrototypeFeedItemCaptureRequest,
  type PrototypeFeedItemCaptureResponse,
  type ExtensionPageObservation,
} from "@serial/bookmark-capture";

const PAGE_LOAD_TIMEOUT_MS = 20_000;
const DOM_QUIET_MS = 750;
const DOM_SETTLE_TIMEOUT_MS = 3_000;

function eligibleHttpUrl(value: string) {
  const url = new URL(value);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password
  ) {
    throw new Error("This page is not eligible for capture");
  }
  return url.toString();
}

function isPrototypeSerialPage(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1")) ||
      (url.protocol === "https:" &&
        (url.hostname === "serial.tube" ||
          url.hostname.endsWith(".serial.tube")))
    );
  } catch {
    return false;
  }
}

async function waitForTabLoad(tabId: number) {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("The source page did not finish loading in time"));
    }, PAGE_LOAD_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      browser.tabs.onUpdated.removeListener(handleUpdated);
      browser.tabs.onRemoved.removeListener(handleRemoved);
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    const handleUpdated = (
      updatedTabId: number,
      changeInfo: { status?: string },
    ) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") finish();
    };
    const handleRemoved = (removedTabId: number) => {
      if (removedTabId !== tabId) return;
      cleanup();
      reject(new Error("The capture tab was closed before extraction"));
    };

    browser.tabs.onUpdated.addListener(handleUpdated);
    browser.tabs.onRemoved.addListener(handleRemoved);
    void browser.tabs
      .get(tabId)
      .then((tab) => {
        if (tab.status === "complete") finish();
      })
      .catch((error: unknown) => {
        cleanup();
        reject(error);
      });
  });
}

async function waitForDomQuiet(tabId: number) {
  await browser.scripting.executeScript({
    target: { tabId },
    args: [DOM_QUIET_MS, DOM_SETTLE_TIMEOUT_MS],
    func: async (quietMs: number, maximumMs: number) => {
      await new Promise<void>((resolve) => {
        let quietTimer = 0;
        const maximumTimer = window.setTimeout(finish, maximumMs);
        const observer = new MutationObserver(scheduleFinish);

        function finish() {
          window.clearTimeout(quietTimer);
          window.clearTimeout(maximumTimer);
          observer.disconnect();
          resolve();
        }

        function scheduleFinish() {
          window.clearTimeout(quietTimer);
          quietTimer = window.setTimeout(finish, quietMs);
        }

        observer.observe(document.documentElement, {
          attributes: true,
          childList: true,
          subtree: true,
        });
        scheduleFinish();
      });
    },
  });
}

function captureFromObservation(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const observation = value as Partial<ExtensionPageObservation>;
  const capture = observation.capture;
  if (
    !capture ||
    typeof capture.contentHtml !== "string" ||
    capture.contentHtml.length === 0 ||
    typeof capture.effectiveUrl !== "string" ||
    typeof capture.title !== "string"
  ) {
    return null;
  }
  return {
    contentHtml: capture.contentHtml,
    effectiveUrl: capture.effectiveUrl,
    title: capture.title,
  };
}

export async function capturePrototypeFeedItem(
  request: PrototypeFeedItemCaptureRequest,
  senderUrl: string | undefined,
): Promise<PrototypeFeedItemCaptureResponse> {
  if (!isPrototypeSerialPage(senderUrl)) {
    return {
      type: PROTOTYPE_FEED_ITEM_CAPTURE_RESPONSE,
      requestId: request.requestId,
      ok: false,
      error: "The capture request did not come from a trusted Serial page",
    };
  }

  let tabId: number | undefined;
  try {
    const sourceUrl = eligibleHttpUrl(request.sourceUrl);
    const tab = await browser.tabs.create({ active: false, url: sourceUrl });
    if (typeof tab.id !== "number") {
      throw new Error("Chrome did not return a capture tab ID");
    }
    tabId = tab.id;

    await waitForTabLoad(tabId);
    await waitForDomQuiet(tabId);
    const results = await browser.scripting.executeScript({
      target: { tabId },
      files: ["/content-scripts/bookmark-capture.js"],
    });
    const capture = captureFromObservation(results[0]?.result);
    if (!capture) {
      throw new Error(
        "The page loaded, but the Bookmark extractor found no readable article",
      );
    }
    return {
      type: PROTOTYPE_FEED_ITEM_CAPTURE_RESPONSE,
      requestId: request.requestId,
      ok: true,
      capture,
    };
  } catch (error) {
    return {
      type: PROTOTYPE_FEED_ITEM_CAPTURE_RESPONSE,
      requestId: request.requestId,
      ok: false,
      error:
        error instanceof Error ? error.message : "Unable to capture this page",
    };
  } finally {
    if (tabId !== undefined) {
      await browser.tabs.remove(tabId).catch(() => undefined);
    }
  }
}
