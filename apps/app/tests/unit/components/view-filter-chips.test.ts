// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://serial.test/" }

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createStore, Provider } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ApplicationView } from "~/server/db/schema";
import { ViewFilterChips } from "~/components/feed/ViewFilterChips";
import {
  viewFilterIdAtom,
  viewsAtom,
  visibilityFilterAtom,
} from "~/lib/data/atoms";
import { navigationSnapshotStore } from "~/lib/data/navigation/store";
import { viewsStore } from "~/lib/data/views/store";

vi.mock("~/components/ButtonWithShortcut", () => ({
  KeyboardShortcutDisplay: () => null,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const NOW = new Date("2026-08-02T12:00:00.000Z");

function view(id: number, name: string): ApplicationView {
  return {
    id,
    userId: "view-filter-user",
    name,
    daysWindow: 0,
    readStatus: 0,
    contentFilter: 3,
    layout: "list",
    placement: id,
    createdAt: NOW,
    updatedAt: NOW,
    categoryIds: [],
    feedIds: [],
    isDefault: false,
    viewSections: [],
  };
}

function renderViewFilterChips(
  input: {
    cachedViews?: ApplicationView[];
    hasFetchedViews?: boolean;
  } = {},
) {
  const cachedViews = input.cachedViews ?? [
    view(1, "Reading"),
    view(2, "Research"),
  ];
  viewsStore.setState({
    views: cachedViews,
    fetchStatus: input.hasFetchedViews === false ? "idle" : "success",
  });
  const jotaiStore = createStore();
  jotaiStore.set(viewsAtom, cachedViews);
  jotaiStore.set(viewFilterIdAtom, 1);
  jotaiStore.set(visibilityFilterAtom, "unread");

  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        Provider,
        { store: jotaiStore },
        createElement(ViewFilterChips),
      ),
    );
  });
  const markup = container.innerHTML;
  act(() => root.unmount());
  return markup;
}

function chipFromMarkup(markup: string, label: string) {
  const container = document.createElement("div");
  container.innerHTML = markup;
  const chip = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === label,
  );
  if (!chip) throw new Error(`Missing ${label} View chip`);
  return chip;
}

afterEach(() => {
  navigationSnapshotStore.getState().reset();
  viewsStore.getState().reset();
});

describe("View filter loading", () => {
  it("keeps cached View chips and their previous dimming while revalidating", () => {
    navigationSnapshotStore.getState().set({
      views: {
        1: { unread: true, read: false, later: false },
        2: { unread: false, read: false, later: false },
      },
      tags: {},
      feeds: {},
      viewFeeds: {},
    });
    navigationSnapshotStore.getState().reset();
    navigationSnapshotStore.setState({
      fetchStatus: "fetching",
    });

    const markup = renderViewFilterChips();

    expect(markup).toContain("Reading");
    expect(markup).toContain("Research");
    expect(markup).not.toContain('data-slot="skeleton"');
    expect(chipFromMarkup(markup, "Reading").classList).not.toContain(
      "opacity-50",
    );
    expect(chipFromMarkup(markup, "Research").classList).toContain(
      "opacity-50",
    );
  });

  it("previews four content-shaped View chips on a true first load", () => {
    const markup = renderViewFilterChips({
      cachedViews: [],
      hasFetchedViews: false,
    });

    expect(markup.match(/data-slot="skeleton"/g)).toHaveLength(4);
    for (const width of ["w-16", "w-22", "w-18", "w-26"]) {
      expect(markup).toContain(`h-8 ${width}`);
    }

    const renderedMarkup = renderViewFilterChips();
    expect(chipFromMarkup(renderedMarkup, "Reading").classList).toContain(
      "h-8",
    );
  });

  it("applies fresh View dimming after successful revalidation", () => {
    navigationSnapshotStore.getState().set({
      views: {
        1: { unread: true, read: false, later: false },
        2: { unread: false, read: false, later: false },
      },
      tags: {},
      feeds: {},
      viewFeeds: {},
    });
    navigationSnapshotStore.getState().set({
      views: {
        1: { unread: false, read: false, later: false },
        2: { unread: true, read: false, later: false },
      },
      tags: {},
      feeds: {},
      viewFeeds: {},
    });

    const markup = renderViewFilterChips();

    expect(chipFromMarkup(markup, "Reading").classList).toContain("opacity-50");
    expect(chipFromMarkup(markup, "Research").classList).not.toContain(
      "opacity-50",
    );
  });

  it("retains previous View dimming after failed revalidation", () => {
    navigationSnapshotStore.getState().set({
      views: {
        1: { unread: true, read: false, later: false },
        2: { unread: false, read: false, later: false },
      },
      tags: {},
      feeds: {},
      viewFeeds: {},
    });
    navigationSnapshotStore.getState().reset();

    const markup = renderViewFilterChips();

    expect(chipFromMarkup(markup, "Reading").classList).not.toContain(
      "opacity-50",
    );
    expect(chipFromMarkup(markup, "Research").classList).toContain(
      "opacity-50",
    );
  });
});
