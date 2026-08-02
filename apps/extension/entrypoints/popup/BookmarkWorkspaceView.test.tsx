import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { FeedDiscovery } from "./BookmarkWorkspaceView";
import type { BookmarkWorkspace } from "../../lib/bookmarks";

const FEED_URL = "https://example.com/feed.xml";
const workspace = {
  feeds: [{ url: FEED_URL, title: "Example Feed" }],
} as BookmarkWorkspace;

function renderFeedDiscovery(input: {
  pendingFeedUrls?: string[];
  addedFeedUrls?: string[];
}) {
  return renderToStaticMarkup(
    createElement(FeedDiscovery, {
      workspace,
      pendingFeedUrls: input.pendingFeedUrls ?? [],
      addedFeedUrls: input.addedFeedUrls ?? [],
      onAddFeed: vi.fn(),
    }),
  );
}

describe("extension Feed discovery actions", () => {
  it("replaces the Add icon with a spinner throughout initial ingestion", () => {
    const markup = renderFeedDiscovery({ pendingFeedUrls: [FEED_URL] });

    expect(markup).toContain('aria-label="Adding Example Feed"');
    expect(markup).toContain("animate-spin");
    expect(markup).not.toContain("lucide-plus");
    expect(markup.match(/lucide-rss/g)).toHaveLength(1);
  });

  it("shows the completed state only after ingestion finishes", () => {
    const markup = renderFeedDiscovery({ addedFeedUrls: [FEED_URL] });

    expect(markup).toContain('aria-label="Feed added"');
    expect(markup).toContain("lucide-check");
    expect(markup).not.toContain("animate-spin");
  });
});
