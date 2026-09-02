// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://serial.test/" }

import { getDefaultStore } from "jotai";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfflineBanner } from "~/components/OfflineBanner";
import { ArticleImageLightbox } from "~/components/feed/read/ArticleImageLightbox";
import { connectionStateAtom } from "~/lib/data/atoms";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Array<ReturnType<typeof createRoot>> = [];

function render(element: ReturnType<typeof createElement>) {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element));
  return container;
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  getDefaultStore().set(connectionStateAtom, "unknown");
  vi.useRealTimers();
});

describe("Offline banner", () => {
  it("waits through a short disconnect and clears on reconnect", () => {
    vi.useFakeTimers();
    const container = render(createElement(OfflineBanner));

    act(() => getDefaultStore().set(connectionStateAtom, "disconnected"));
    expect(container.textContent).toBe("");

    act(() => vi.advanceTimersByTime(1_000));
    expect(container.textContent).toBe(
      "Offline, some features may be disabled",
    );

    act(() => getDefaultStore().set(connectionStateAtom, "connected"));
    expect(container.textContent).toBe("");
  });
});

describe("article image fallback", () => {
  it("keeps a failed image in flow as a square muted block", () => {
    const container = render(
      createElement(ArticleImageLightbox, {
        src: "https://example.com/unavailable.jpg",
        alt: "Unavailable illustration",
      }),
    );
    const image = container.querySelector("img");
    expect(image).not.toBeNull();

    act(() => image?.dispatchEvent(new Event("error")));

    const fallback = container.querySelector("[data-image-fallback]");
    expect(fallback?.className).toContain("aspect-square");
    expect(fallback?.className).toContain("bg-muted");
    expect(fallback?.getAttribute("aria-label")).toBe(
      "Unavailable illustration",
    );
  });
});
