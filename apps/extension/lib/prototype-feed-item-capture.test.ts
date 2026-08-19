import { afterEach, describe, expect, it, vi } from "vitest";

import { capturePrototypeFeedItem } from "./prototype-feed-item-capture";

const request = {
  type: "prototype.feed-item-capture.request" as const,
  requestId: "capture-one",
  sourceUrl: "https://publisher.example/private-article",
};

function stubBrowser(captureResult: unknown) {
  const create = vi.fn(() => Promise.resolve({ id: 42, status: "loading" }));
  const get = vi.fn(() => Promise.resolve({ id: 42, status: "complete" }));
  const remove = vi.fn(() => Promise.resolve());
  const executeScript = vi.fn((input: { files?: string[] }) =>
    Promise.resolve(
      input.files ? [{ result: captureResult }] : [{ result: undefined }],
    ),
  );
  const event = {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  };

  vi.stubGlobal("browser", {
    tabs: {
      create,
      get,
      remove,
      onRemoved: event,
      onUpdated: event,
    },
    scripting: { executeScript },
  });

  return { create, executeScript, remove };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prototype Feed-item page capture", () => {
  it("opens an inactive profile tab, extracts the rendered page, and closes it", async () => {
    const browser = stubBrowser({
      sourceUrl: request.sourceUrl,
      capture: {
        contentHtml: "<p>Authenticated full article</p>",
        effectiveUrl: request.sourceUrl,
        title: "Private article",
      },
      feeds: [],
    });

    const response = await capturePrototypeFeedItem(
      request,
      "http://localhost:3000/read/item-one",
    );

    expect(browser.create).toHaveBeenCalledWith({
      active: false,
      url: request.sourceUrl,
    });
    expect(browser.executeScript).toHaveBeenLastCalledWith({
      target: { tabId: 42 },
      files: ["/content-scripts/bookmark-capture.js"],
    });
    expect(browser.remove).toHaveBeenCalledWith(42);
    expect(response).toEqual({
      type: "prototype.feed-item-capture.response",
      requestId: request.requestId,
      ok: true,
      capture: {
        contentHtml: "<p>Authenticated full article</p>",
        effectiveUrl: request.sourceUrl,
        title: "Private article",
      },
    });
  });

  it("rejects requests outside Serial without opening a page", async () => {
    const browser = stubBrowser(undefined);

    const response = await capturePrototypeFeedItem(
      request,
      "https://attacker.example/read/item-one",
    );

    expect(response).toMatchObject({ ok: false });
    expect(browser.create).not.toHaveBeenCalled();
  });

  it("closes the temporary tab when extraction fails", async () => {
    const browser = stubBrowser({ captureFailureReason: "unextractable" });

    const response = await capturePrototypeFeedItem(
      request,
      "https://app.serial.tube/read/item-one",
    );

    expect(response).toMatchObject({
      ok: false,
      error:
        "The page loaded, but the Bookmark extractor found no readable article",
    });
    expect(browser.remove).toHaveBeenCalledWith(42);
  });
});
