// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://serial.test/" }

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReleaseNotifierClient } from "~/components/releases/ReleaseNotifierClient";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { dismiss: vi.fn() }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const RELEASE_SLUG_KEY = "last-viewed-release";
const roots: Array<ReturnType<typeof createRoot>> = [];

function renderNotifier(slug: string | undefined) {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push(root);

  act(() => {
    root.render(createElement(ReleaseNotifierClient, { slug }));
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("ReleaseNotifierClient", () => {
  it("stores the latest release without notifying on the first visit", () => {
    renderNotifier("release-one");

    expect(window.localStorage.getItem(RELEASE_SLUG_KEY)).toBe("release-one");
    expect(toast).not.toHaveBeenCalled();
  });

  it("does not notify when the stored release is still current", () => {
    window.localStorage.setItem(RELEASE_SLUG_KEY, "release-one");

    renderNotifier("release-one");

    expect(toast).not.toHaveBeenCalled();
  });

  it("stores and notifies for a later release", () => {
    window.localStorage.setItem(RELEASE_SLUG_KEY, "release-one");

    renderNotifier("release-two");

    expect(window.localStorage.getItem(RELEASE_SLUG_KEY)).toBe("release-two");
    expect(toast).toHaveBeenCalledOnce();
  });
});
