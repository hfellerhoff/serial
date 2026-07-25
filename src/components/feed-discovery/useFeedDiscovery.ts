import { useCallback, useRef, useState } from "react";
import { normalizeFeedSearchUrl } from "./feedSearchOptions";
import type { DiscoveredFeed } from "./FeedDiscoveryResults";
import { orpcRouterClient } from "~/lib/orpc";

type DiscoveryState = "input" | "discovering" | "no-results" | "select";

export function useFeedDiscovery() {
  const requestIdRef = useRef(0);
  const [url, setUrl] = useState("");
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>("input");
  const [discoveredFeeds, setDiscoveredFeeds] = useState<DiscoveredFeed[]>([]);

  const reset = useCallback(() => {
    requestIdRef.current++;
    setUrl("");
    setDiscoveryState("input");
    setDiscoveredFeeds([]);
  }, []);

  const discoverFeeds = useCallback(
    async (urlOverride?: string) => {
      const requestedUrl = urlOverride ?? url;
      if (!requestedUrl) {
        return;
      }

      const normalizedUrl = normalizeFeedSearchUrl(requestedUrl);
      if (!normalizedUrl) return;
      const requestId = ++requestIdRef.current;

      setDiscoveryState("discovering");
      setUrl(requestedUrl);
      setDiscoveredFeeds([]);

      try {
        const feeds = await orpcRouterClient.feed.discoverFeeds({
          url: normalizedUrl,
        });
        if (requestId !== requestIdRef.current) return;

        if (feeds.length === 0) {
          setDiscoveryState("no-results");
        } else {
          setDiscoveredFeeds(feeds);
          setDiscoveryState("select");
        }
      } catch {
        if (requestId !== requestIdRef.current) return;
        setDiscoveryState("no-results");
      }
    },
    [url],
  );

  const handleUrlChange = useCallback((newUrl: string) => {
    requestIdRef.current++;
    setUrl(newUrl);
    setDiscoveryState("input");
    setDiscoveredFeeds([]);
  }, []);

  return {
    url,
    discoveryState,
    discoveredFeeds,
    isDiscovering: discoveryState === "discovering",
    hasNoResults: discoveryState === "no-results",
    isSelecting: discoveryState === "select",
    discoverFeeds,
    handleUrlChange,
    reset,
  };
}
