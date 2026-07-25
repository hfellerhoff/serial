import { Loader2Icon, RssIcon, SearchIcon, SearchXIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  normalizeFeedSearchUrl,
  STATIC_FEED_SEARCH_OPTIONS,
} from "./feedSearchOptions";
import type { Ref } from "react";
import type { DiscoveredFeed } from "./FeedDiscoveryResults";
import type { StaticFeedSearchOption } from "./feedSearchOptions";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import { Button } from "~/components/ui/button";

function StaticFeedResult({
  option,
  onSelect,
}: {
  option: StaticFeedSearchOption;
  onSelect: (option: StaticFeedSearchOption) => void;
}) {
  return (
    <CommandItem
      className="gap-2"
      value={`${option.label} ${option.url}`}
      keywords={option.keywords}
      onSelect={() => onSelect(option)}
    >
      <RssIcon className="text-muted-foreground size-4" />
      <div className="min-w-0">
        <p className="truncate">{option.label}</p>
        <p className="text-muted-foreground truncate text-xs">
          {option.description ?? option.url}
        </p>
      </div>
    </CommandItem>
  );
}

interface FeedDiscoveryCommandProps {
  url: string;
  onUrlChange: (url: string) => void;
  onDiscover: (url?: string) => void;
  onSelectFeed: (feed: DiscoveredFeed) => void;
  discoveredFeeds: DiscoveredFeed[];
  state: "input" | "discovering" | "no-results" | "select" | "adding";
  inputRef?: Ref<HTMLInputElement>;
}

const AUTO_DISCOVERY_DELAY_MS = 500;

export function FeedDiscoveryCommand({
  url,
  onUrlChange,
  onDiscover,
  onSelectFeed,
  discoveredFeeds,
  state,
  inputRef,
}: FeedDiscoveryCommandProps) {
  const commandRef = useRef<HTMLDivElement>(null);
  const normalizedUrl = normalizeFeedSearchUrl(url);
  const isAddingFeed = state === "adding";
  const isDiscovering = state === "discovering";
  const hasNoResults = state === "no-results";
  const isSelecting = state === "select";
  const [lastAutoDiscoveredUrl, setLastAutoDiscoveredUrl] = useState<
    string | null
  >(null);
  const isAutoDiscoveryPending =
    normalizedUrl !== null &&
    !isDiscovering &&
    !isSelecting &&
    lastAutoDiscoveredUrl !== normalizedUrl;

  useEffect(() => {
    if (
      !normalizedUrl ||
      isAddingFeed ||
      isDiscovering ||
      isSelecting ||
      lastAutoDiscoveredUrl === normalizedUrl
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setLastAutoDiscoveredUrl(normalizedUrl);
      onDiscover();
    }, AUTO_DISCOVERY_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    isDiscovering,
    isAddingFeed,
    isSelecting,
    lastAutoDiscoveredUrl,
    normalizedUrl,
    onDiscover,
  ]);

  useEffect(() => {
    if (!isSelecting) return;

    const animationFrame = window.requestAnimationFrame(() => {
      commandRef.current
        ?.querySelector<HTMLInputElement>("[cmdk-input]")
        ?.focus();
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [isSelecting]);

  return (
    <Command
      ref={commandRef}
      className="h-full min-h-0 rounded-none border-0 sm:h-auto [&_[cmdk-input-wrapper]_svg]:size-5 [&_[cmdk-input]]:pr-10 sm:[&_[cmdk-input]]:pr-0 [&_[cmdk-item]]:pointer-events-auto [&_[cmdk-item]]:opacity-100"
      shouldFilter={
        !isAddingFeed &&
        !isDiscovering &&
        !isSelecting &&
        !isAutoDiscoveryPending
      }
    >
      <CommandInput
        ref={inputRef}
        value={url}
        onValueChange={onUrlChange}
        className="h-14 text-base"
        placeholder="Paste a URL or search for a feed..."
        disabled={isAddingFeed}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !isSelecting || isAddingFeed) return;

          const command = event.currentTarget.closest("[cmdk-root]");
          const selectedItem =
            command?.querySelector<HTMLElement>(
              '[cmdk-item][data-selected="true"]',
            ) ?? command?.querySelector<HTMLElement>("[cmdk-item]");

          if (selectedItem) {
            event.preventDefault();
            selectedItem.click();
          }
        }}
      />
      <CommandList className="relative flex max-h-none min-h-0 flex-1 flex-col sm:max-h-[min(60dvh,32rem,calc(100dvh-5.5rem))] sm:min-h-[min(20rem,60dvh,calc(100dvh-5.5rem))] sm:flex-none">
        {isAddingFeed ? (
          <CommandGroup>
            <CommandItem className="gap-2" disabled value="adding">
              <Loader2Icon className="size-4 animate-spin" />
              Adding feed…
            </CommandItem>
          </CommandGroup>
        ) : isDiscovering || isAutoDiscoveryPending ? (
          <CommandGroup>
            <CommandItem className="gap-2" disabled value="discovering">
              <Loader2Icon className="size-4 animate-spin" />
              Finding feeds…
            </CommandItem>
          </CommandGroup>
        ) : isSelecting ? (
          <CommandGroup>
            {discoveredFeeds.map((feed) => (
              <CommandItem
                className="gap-2"
                key={feed.url}
                value={`${feed.title ?? ""} ${feed.url}`}
                onSelect={() => onSelectFeed(feed)}
              >
                <RssIcon className="text-muted-foreground size-4" />
                <div className="min-w-0">
                  <p className="truncate">{feed.title || feed.url}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {feed.url}
                  </p>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : hasNoResults ? (
          <div className="text-muted-foreground absolute inset-0 px-6 py-6 text-center text-sm sm:flex sm:items-center sm:justify-center">
            <div
              className="absolute top-1/3 left-1/2 flex w-[calc(100%-3rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 sm:static sm:w-auto sm:translate-x-0 sm:translate-y-0"
              data-testid="feed-discovery-failure-state"
            >
              <SearchXIcon className="size-8" strokeWidth={1.5} />
              <span role="status">No feeds found for URL.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onDiscover()}
              >
                Retry
              </Button>
            </div>
          </div>
        ) : (
          <>
            <CommandEmpty className="text-muted-foreground absolute inset-0 px-6 py-6 text-center sm:flex sm:items-center sm:justify-center">
              <div
                className="absolute top-1/3 left-1/2 flex w-[calc(100%-3rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 sm:static sm:w-auto sm:translate-x-0 sm:translate-y-0"
                data-testid="feed-discovery-empty-state"
              >
                <SearchIcon className="size-8" strokeWidth={1.5} />
                <span>Enter a website, channel, or RSS feed URL.</span>
              </div>
            </CommandEmpty>
            {STATIC_FEED_SEARCH_OPTIONS.length > 0 && (
              <CommandGroup heading="Suggested feeds">
                {STATIC_FEED_SEARCH_OPTIONS.map((option) => (
                  <StaticFeedResult
                    key={`${option.label}:${option.url}`}
                    option={option}
                    onSelect={(selectedOption) =>
                      onDiscover(selectedOption.url)
                    }
                  />
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </Command>
  );
}
