import { useCallback, useState } from "react";
import { orpcRouterClient } from "~/lib/orpc";
import type { DiscoveredFeed } from "./FeedDiscoveryResults";

type DiscoveryState = "input" | "discovering" | "select" | "locked";

export function useFeedDiscovery() {
  const [url, setUrl] = useState("");
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>("input");
  const [discoveredFeeds, setDiscoveredFeeds] = useState<DiscoveredFeed[]>([]);
  const [selectedFeed, setSelectedFeed] = useState<DiscoveredFeed | null>(null);

  const reset = useCallback(() => {
    setUrl("");
    setDiscoveryState("input");
    setDiscoveredFeeds([]);
    setSelectedFeed(null);
  }, []);

  const discoverFeeds = useCallback(async () => {
    if (!url) {
      return;
    }

    let normalizedUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      normalizedUrl = `https://${url}`;
    }

    try {
      new URL(normalizedUrl);
    } catch {
      return;
    }

    setDiscoveryState("discovering");
    setDiscoveredFeeds([]);
    setSelectedFeed(null);

    try {
      const feeds = await orpcRouterClient.feed.discoverFeeds({ url: normalizedUrl });

      if (feeds.length === 0) {
        setDiscoveryState("input");
      } else if (feeds.length === 1) {
        setSelectedFeed(feeds[0]!);
        setDiscoveryState("locked");
      } else {
        setDiscoveredFeeds(feeds);
        setDiscoveryState("select");
      }
    } catch {
      setDiscoveryState("input");
    }
  }, [url]);

  const handleUrlChange = useCallback((newUrl: string) => {
    setUrl(newUrl);
    setDiscoveryState("input");
    setDiscoveredFeeds([]);
    setSelectedFeed(null);
  }, []);

  const handleSelectFeed = useCallback((feed: DiscoveredFeed) => {
    setSelectedFeed(feed);
    setDiscoveryState("locked");
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedFeed(null);
    setDiscoveryState(discoveredFeeds.length > 1 ? "select" : "input");
  }, [discoveredFeeds.length]);

  const feedUrl = selectedFeed?.url ?? url;

  let canDiscover = false;
  if (discoveryState === "input" && url.length > 0) {
    let testUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      testUrl = `https://${url}`;
    }
    try {
      new URL(testUrl);
      canDiscover = true;
    } catch {
      canDiscover = false;
    }
  }

  return {
    url,
    feedUrl,
    discoveryState,
    discoveredFeeds,
    selectedFeed,
    isDiscovering: discoveryState === "discovering",
    isLocked: discoveryState === "locked",
    isSelecting: discoveryState === "select",
    canDiscover,
    discoverFeeds,
    handleUrlChange,
    handleSelectFeed,
    handleClearSelection,
    reset,
  };
}
