import { ToggleGroup } from "@radix-ui/react-toggle-group";
import {
  CheckIcon,
  ExternalLinkIcon,
  ImportIcon,
  LinkIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "@tanstack/react-router";
import { ViewCategoriesInput } from "./AddViewDialog";
import {
  FeedDiscoveryInput,
  FeedDiscoveryResults,
  SelectedFeedBadge,
  useFeedDiscovery,
} from "./feed-discovery";
import { Button } from "./ui/button";
import { ChipCombobox } from "./ui/chip-combobox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ControlledResponsiveDialog } from "./ui/responsive-dropdown";
import { Switch } from "./ui/switch";
import { ToggleGroupItem } from "./ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import type { FeedOpenLocation, FeedPlatform } from "~/server/db/schema";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { useFeeds } from "~/lib/data/feeds";
import {
  useCreateFeedMutation,
  useDeleteFeedMutation,
  useEditFeedMutation,
  useSetFeedActiveMutation,
} from "~/lib/data/feeds/mutations";
import { PLATFORM_TO_FORMATTED_NAME_MAP } from "~/lib/data/feeds/utils";
import { useShortcut } from "~/lib/hooks/useShortcut";
import { getAssumedFeedPlatform } from "~/server/rss/validateFeedUrl";
import { useDialogStore } from "~/components/feed/dialogStore";
import { useViews } from "~/lib/data/views";
import { useViewFeeds } from "~/lib/data/view-feeds";
import { INBOX_VIEW_ID } from "~/lib/data/views/constants";
import { useQuickCreateViewMutation } from "~/lib/data/views/mutations";

function useViewOptions() {
  const { views } = useViews();
  return views
    .filter((v) => v.id !== INBOX_VIEW_ID)
    .map((v) => ({ id: v.id, label: v.name }));
}

export function AddFeedDialog() {
  const [isAddingFeed, setIsAddingFeed] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [selectedViewIds, setSelectedViewIds] = useState<number[]>([]);

  const urlInputRef = useRef<HTMLInputElement>(null);
  const discovery = useFeedDiscovery();
  const { mutateAsync: createFeed } = useCreateFeedMutation();
  const { mutateAsync: quickCreateView } = useQuickCreateViewMutation();

  const dialog = useDialogStore((store) => store.dialog);
  const onDialogOpenChange = useDialogStore((store) => store.onOpenChange);

  // Global "a" shortcut: opens the Add Feed dialog from anywhere except the
  // /views and /tags routes, which register their own "a" shortcuts.
  const launchDialog = useDialogStore((store) => store.launchDialog);
  const location = useLocation();
  useShortcut("a", (event) => {
    if (
      location.pathname.startsWith("/views") ||
      location.pathname.startsWith("/tags")
    ) {
      return;
    }
    event.preventDefault();
    launchDialog("add-feed");
  });

  const onOpenChange = (open = false) => {
    onDialogOpenChange(open);

    if (!open) {
      setSelectedCategories([]);
      setSelectedViewIds([]);
      discovery.reset();
    }
  };

  const feedPlatform = getAssumedFeedPlatform(discovery.feedUrl);
  const viewOptions = useViewOptions();

  return (
    <ControlledResponsiveDialog
      open={dialog === "add-feed"}
      onOpenChange={onOpenChange}
      title="Add Feed"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        urlInputRef.current?.focus();
      }}
    >
      <div className="grid gap-6">
        <div className="grid gap-2">
          <Label htmlFor="url" className="pb-1">
            Website, Channel, or RSS Feed URL
          </Label>
          {discovery.isLocked && discovery.selectedFeed ? (
            <SelectedFeedBadge
              feed={discovery.selectedFeed}
              onClear={discovery.handleClearSelection}
            />
          ) : (
            <FeedDiscoveryInput
              url={discovery.url}
              onUrlChange={discovery.handleUrlChange}
              onDiscover={discovery.discoverFeeds}
              isDiscovering={discovery.isDiscovering}
              canDiscover={discovery.canDiscover}
              inputRef={urlInputRef}
            />
          )}
        </div>
        {discovery.isSelecting && (
          <FeedDiscoveryResults
            feeds={discovery.discoveredFeeds}
            onSelectFeed={discovery.handleSelectFeed}
          />
        )}
        {discovery.isLocked && (
          <>
            <ChipCombobox
              label="Views"
              placeholder="Search views..."
              options={viewOptions}
              selectedIds={selectedViewIds}
              onAdd={(id) => setSelectedViewIds([...selectedViewIds, id])}
              onRemove={(id) =>
                setSelectedViewIds(selectedViewIds.filter((v) => v !== id))
              }
              onCreate={async (name) => {
                try {
                  const created = await quickCreateView({ name });
                  if (created) {
                    setSelectedViewIds([...selectedViewIds, created.id]);
                  }
                } catch {
                  toast.error("Failed to create view.");
                }
              }}
              createLabel="Create view"
            />
            <ViewCategoriesInput
              selectedCategories={selectedCategories}
              setSelectedCategories={setSelectedCategories}
            />
            <Button
              disabled={isAddingFeed}
              onClick={async () => {
                setIsAddingFeed(true);

                try {
                  const createFeedPromise = createFeed({
                    url: discovery.feedUrl,
                    categoryIds: selectedCategories,
                    viewIds: selectedViewIds,
                  });
                  toast.promise(createFeedPromise, {
                    loading: "Adding feed...",
                    success: () => {
                      return "Feed added!";
                    },
                    error: () => {
                      return "Something went wrong adding your feed.";
                    },
                  });
                  discovery.reset();
                  onOpenChange(false);
                } catch {
                  // Error handled by toast.promise
                }

                setIsAddingFeed(false);
              }}
            >
              Add {PLATFORM_TO_FORMATTED_NAME_MAP[feedPlatform]} Feed
            </Button>
          </>
        )}
        {!discovery.isLocked && (
          <>
            <hr />
            <div>
              <Label className="block pb-3">Have a lot of feeds to add?</Label>
              <Link to="/import">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    onOpenChange(false);
                  }}
                >
                  <ImportIcon size={16} />
                  <span className="pl-1.5">Bulk Import</span>
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </ControlledResponsiveDialog>
  );
}

export function FeedOpenLocationToggleGroup({
  feedPlatform,
  openLocation,
  setOpenLocation,
}: {
  feedPlatform: FeedPlatform;
  openLocation: FeedOpenLocation;
  setOpenLocation: (location: FeedOpenLocation) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="categories">Open items in</Label>
      <ToggleGroup
        id="categories"
        type="single"
        value={openLocation}
        onValueChange={(value) => {
          if (!value) return;
          setOpenLocation(value as FeedOpenLocation);
        }}
        className="flex w-fit flex-wrap justify-start gap-1"
      >
        <ToggleGroupItem size="sm" variant="outline" value="serial">
          Serial
        </ToggleGroupItem>
        <ToggleGroupItem size="sm" variant="outline" value="origin">
          {PLATFORM_TO_FORMATTED_NAME_MAP[feedPlatform]}
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

export function EditFeedDialog({
  selectedFeedId,
  onClose,
}: {
  selectedFeedId: null | number;
  onClose: () => void;
}) {
  const [isUpdatingFeed, setIsUpdatingFeed] = useState(false);
  const [isDeletingFeed, setIsDeletingFeed] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  const { mutateAsync: editFeed } = useEditFeedMutation();
  const { mutateAsync: deleteFeed } = useDeleteFeedMutation();
  const { mutate: setFeedActive } = useSetFeedActiveMutation();
  const { mutateAsync: quickCreateView } = useQuickCreateViewMutation();

  const [name, setName] = useState<string>("");
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [selectedViewIds, setSelectedViewIds] = useState<number[]>([]);
  const [selectedOpenLocation, setSelectedOpenLocation] =
    useState<FeedOpenLocation>("serial");

  const isFormDisabled = !name;

  const { feeds } = useFeeds();
  const { feedCategories } = useFeedCategories();
  const { viewFeeds } = useViewFeeds();
  const viewOptions = useViewOptions();

  useEffect(() => {
    if (selectedFeedId == null) return;

    const feed = feeds.find((v) => v.id === selectedFeedId);
    if (!feed) return;

    const _feedCategories = feedCategories
      .filter((category) => category.feedId === feed.id)
      .map((category) => category.categoryId)
      .filter((id) => typeof id === "number");

    const _feedViewIds = viewFeeds
      .filter((vf) => vf.feedId === feed.id)
      .map((vf) => vf.viewId);

    setName(feed.name);
    setSelectedCategories(_feedCategories);
    setSelectedViewIds(_feedViewIds);
    setSelectedOpenLocation(feed.openLocation);
  }, [feedCategories, viewFeeds, selectedFeedId, feeds]);

  const feed = feeds.find((v) => v.id === selectedFeedId);

  const websiteUrl = (() => {
    if (!feed?.url) return "#";
    try {
      const url = new URL(feed.url);
      if (feed.platform === "youtube") {
        const channelId = url.searchParams.get("channel_id");
        if (channelId) return `https://www.youtube.com/channel/${channelId}`;
      }
      return url.origin;
    } catch {
      return "#";
    }
  })();

  const platformName =
    PLATFORM_TO_FORMATTED_NAME_MAP[feed?.platform ?? "youtube"];

  return (
    <ControlledResponsiveDialog
      open={selectedFeedId !== null}
      onOpenChange={onClose}
      title="Edit Feed"
      headerRight={
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center">
              <Switch
                checked={feed?.isActive ?? true}
                onCheckedChange={(checked) => {
                  if (selectedFeedId !== null) {
                    setFeedActive({
                      feedId: selectedFeedId,
                      isActive: checked,
                    });
                  }
                }}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {feed?.isActive ? "Feed active" : "Feed inactive"}
          </TooltipContent>
        </Tooltip>
      }
    >
      <div className="grid gap-6">
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <div className="flex gap-2">
            <Input
              id="name"
              type="text"
              value={name}
              placeholder="My Feed"
              disabled
              className="flex-1"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(feed?.url ?? "");
                    toast.success("Feed URL copied!");
                    setHasCopied(true);
                    setTimeout(() => setHasCopied(false), 2000);
                  }}
                >
                  {hasCopied ? <CheckIcon size={16} /> : <LinkIcon size={16} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy Feed URL</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  asChild
                >
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLinkIcon size={16} />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open in {platformName}</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <ChipCombobox
          label="Views"
          placeholder="Search views..."
          options={viewOptions}
          selectedIds={selectedViewIds}
          onAdd={(id) => setSelectedViewIds([...selectedViewIds, id])}
          onRemove={(id) =>
            setSelectedViewIds(selectedViewIds.filter((v) => v !== id))
          }
          onCreate={async (name) => {
            try {
              const created = await quickCreateView({ name });
              if (created) {
                setSelectedViewIds([...selectedViewIds, created.id]);
              }
            } catch {
              toast.error("Failed to create view.");
            }
          }}
          createLabel="Create view"
        />
        <ViewCategoriesInput
          selectedCategories={selectedCategories}
          setSelectedCategories={setSelectedCategories}
        />
        <FeedOpenLocationToggleGroup
          feedPlatform={feed?.platform ?? "youtube"}
          openLocation={selectedOpenLocation}
          setOpenLocation={setSelectedOpenLocation}
        />
        <div className="flex gap-2">
          <Button
            disabled={isDeletingFeed}
            className="flex-1"
            variant="destructive"
            onClick={async () => {
              if (selectedFeedId === null) return;

              setIsDeletingFeed(true);
              try {
                const deleteFeedPromise = deleteFeed(selectedFeedId);
                toast.promise(deleteFeedPromise, {
                  loading: "Deleting feed...",
                  success: () => {
                    return "Feed deleted!";
                  },
                  error: () => {
                    return "Something went wrong deleting your feed.";
                  },
                });
                onClose();
              } catch {
                // Error handled by toast.promise
              }

              setIsDeletingFeed(false);
            }}
          >
            {isDeletingFeed ? "Deleting..." : "Delete"}
          </Button>
          <Button
            disabled={isFormDisabled || isUpdatingFeed}
            onClick={async () => {
              if (selectedFeedId === null) return;

              setIsUpdatingFeed(true);
              try {
                await editFeed({
                  feedId: selectedFeedId,
                  categoryIds: selectedCategories,
                  viewIds: selectedViewIds,
                  openLocation: selectedOpenLocation,
                });
                toast.success("Feed updated!");
                onClose();
              } catch {
                // Error handled by toast
              }

              setIsUpdatingFeed(false);
            }}
            className="flex-1"
          >
            {isUpdatingFeed ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </ControlledResponsiveDialog>
  );
}
