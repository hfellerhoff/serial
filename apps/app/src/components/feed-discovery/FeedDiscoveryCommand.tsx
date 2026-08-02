import {
  BookmarkIcon,
  Loader2Icon,
  RefreshCwIcon,
  RssIcon,
  SearchIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  normalizeFeedSearchUrl,
  STATIC_FEED_SEARCH_OPTIONS,
} from "./feedSearchOptions";
import type { ReactNode, Ref } from "react";
import type { DiscoveredFeed } from "./FeedDiscoveryResults";
import type { StaticFeedSearchOption } from "./feedSearchOptions";
import type { ContentPlatform } from "~/lib/content/descriptor";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";

const CENTERED_STATE_CLASS_NAME =
  "text-muted-foreground absolute inset-0 px-6 py-6 text-center sm:flex sm:items-center sm:justify-center";

function CenteredStateContent({
  children,
  testId,
}: {
  children: ReactNode;
  testId: string;
}) {
  return (
    <div
      className="absolute top-1/3 left-1/2 flex w-[calc(100%-3rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 sm:static sm:w-auto sm:translate-x-0 sm:translate-y-0"
      data-testid={testId}
    >
      {children}
    </div>
  );
}

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
  onSelectBookmark: (url: string) => void;
  bookmarkPlatform: ContentPlatform;
  discoveredFeeds: DiscoveredFeed[];
  state: "input" | "discovering" | "no-results" | "select" | "adding";
  inputRef?: Ref<HTMLInputElement>;
  loadingLabel?: string;
}

const AUTO_DISCOVERY_DELAY_MS = 500;
const BOOKMARK_ACTION_LABEL: Record<ContentPlatform, string> = {
  website: "Bookmark page to read later",
  youtube: "Bookmark video to watch later",
  peertube: "Bookmark video to watch later",
  nebula: "Bookmark video to watch later",
};

export function FeedDiscoveryCommand({
  url,
  onUrlChange,
  onDiscover,
  onSelectFeed,
  onSelectBookmark,
  bookmarkPlatform,
  discoveredFeeds,
  state,
  inputRef,
  loadingLabel = "Adding feed…",
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
        onValueChange={(nextUrl) => {
          setLastAutoDiscoveredUrl(null);
          onUrlChange(nextUrl);
        }}
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
        {normalizedUrl ? (
          <>
            {(isAddingFeed || isDiscovering || isAutoDiscoveryPending) && (
              <div
                className={CENTERED_STATE_CLASS_NAME}
                role="status"
                aria-live="polite"
              >
                <CenteredStateContent testId="feed-discovery-loading-state">
                  <Loader2Icon
                    className="size-8 animate-spin"
                    strokeWidth={1.5}
                  />
                  <span>{isAddingFeed ? loadingLabel : "Finding feeds…"}</span>
                </CenteredStateContent>
              </div>
            )}
            <CommandGroup
              heading="Feeds"
              className={isSelecting || hasNoResults ? undefined : "hidden"}
            >
              {hasNoResults && (
                <CommandItem
                  className="gap-2"
                  value={`Retry finding feeds ${normalizedUrl}`}
                  onSelect={() => onDiscover()}
                >
                  <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded">
                    <RefreshCwIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate">Retry finding feeds</p>
                    <p className="text-muted-foreground truncate text-xs">
                      No feeds found for URL.
                    </p>
                  </div>
                </CommandItem>
              )}
              {discoveredFeeds.map((feed) => (
                <CommandItem
                  className="gap-2"
                  key={feed.url}
                  value={`${feed.title ?? ""} ${feed.url}`}
                  onSelect={() => onSelectFeed(feed)}
                >
                  <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded">
                    <RssIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate">{feed.title || feed.url}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {feed.url}
                    </p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup
              heading="Bookmark"
              className={isSelecting || hasNoResults ? undefined : "hidden"}
            >
              {(isSelecting || hasNoResults) && (
                <CommandItem
                  className="gap-2"
                  value={`${BOOKMARK_ACTION_LABEL[bookmarkPlatform]} ${normalizedUrl}`}
                  onSelect={() => onSelectBookmark(normalizedUrl)}
                >
                  <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded">
                    <BookmarkIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate">
                      {BOOKMARK_ACTION_LABEL[bookmarkPlatform]}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {normalizedUrl}
                    </p>
                  </div>
                </CommandItem>
              )}
            </CommandGroup>
          </>
        ) : (
          <>
            <CommandEmpty className={CENTERED_STATE_CLASS_NAME}>
              <CenteredStateContent testId="feed-discovery-empty-state">
                <SearchIcon className="size-8" strokeWidth={1.5} />
                <span>Enter a website, channel, or RSS feed URL.</span>
              </CenteredStateContent>
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
