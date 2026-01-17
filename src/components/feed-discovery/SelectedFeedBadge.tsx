import { RssIcon, XIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import type { DiscoveredFeed } from "./FeedDiscoveryResults";

interface SelectedFeedBadgeProps {
  feed: DiscoveredFeed;
  onClear: () => void;
}

export function SelectedFeedBadge({ feed, onClear }: SelectedFeedBadgeProps) {
  return (
    <div className="flex min-w-0 items-center gap-3 overflow-hidden rounded-md border px-3 py-2">
      <RssIcon className="text-muted-foreground h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {feed.title || feed.url}
        </p>
        <p className="text-muted-foreground truncate text-xs">{feed.url}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 w-6 shrink-0 p-0"
        onClick={onClear}
      >
        <XIcon className="h-3 w-3" />
        <span className="sr-only">Change feed</span>
      </Button>
    </div>
  );
}
