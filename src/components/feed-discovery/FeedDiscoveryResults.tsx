import { RssIcon } from "lucide-react";
import { cn } from "~/lib/utils";

export interface DiscoveredFeed {
  url: string;
  title?: string;
  format?: string;
}

interface FeedDiscoveryResultsProps {
  feeds: DiscoveredFeed[];
  onSelectFeed: (feed: DiscoveredFeed) => void;
}

export function FeedDiscoveryResults({
  feeds,
  onSelectFeed,
}: FeedDiscoveryResultsProps) {
  if (feeds.length === 0) {
    return null;
  }

  return (
    <div className="grid min-w-0 gap-1 overflow-hidden">
      <p className="text-muted-foreground text-sm">
        {feeds.length} feed{feeds.length !== 1 ? "s" : ""} found. Select one:
      </p>
      <div className="grid min-w-0 gap-2 overflow-hidden pt-1">
        {feeds.map((feed) => (
          <button
            key={feed.url}
            type="button"
            onClick={() => onSelectFeed(feed)}
            className={cn(
              "hover:bg-accent flex min-w-0 items-center gap-3 overflow-hidden rounded-md border px-3 py-2 text-left transition-colors",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
            )}
          >
            <RssIcon className="text-muted-foreground h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {feed.title || feed.url}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {feed.url}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
