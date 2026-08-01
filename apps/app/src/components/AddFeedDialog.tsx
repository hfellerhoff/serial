import { ToggleGroup } from "@radix-ui/react-toggle-group";
import { CheckIcon, ExternalLinkIcon, LinkIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "@tanstack/react-router";
import { FeedDiscoveryCommand } from "./feed-discovery/FeedDiscoveryCommand";
import { useFeedDiscovery } from "./feed-discovery/useFeedDiscovery";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { ControlledResponsiveDialog } from "./ui/responsive-dropdown";
import { SelectableChipList } from "./ui/selectable-chip-list";
import { Switch } from "./ui/switch";
import { ToggleGroupItem } from "./ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import type { FeedOpenLocation, FeedPlatform } from "~/server/db/schema";
import type { BookmarkSaveResult } from "~/server/bookmarks/contracts";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
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
import { useDialogStore } from "~/components/feed/dialogStore";
import { useViews } from "~/lib/data/views";
import { useViewFeeds } from "~/lib/data/view-feeds";
import { INBOX_VIEW_ID } from "~/lib/data/views/constants";
import { useContentCategories } from "~/lib/data/content-categories";
import { useCreateContentCategoryMutation } from "~/lib/data/content-categories/mutations";
import { useQuickCreateViewMutation } from "~/lib/data/views/mutations";
import { VIEW_LAYOUT_ITEM_TYPE } from "~/server/db/constants";
import { getAssumedFeedPlatform } from "~/server/rss/validateFeedUrl";
import { useSaveBookmarkMutation } from "~/lib/data/bookmarks/mutations";
import { BookmarkOrganizationEditor } from "~/components/bookmarks/BookmarkOrganizationEditor";

function useViewOptions() {
  const { views } = useViews();
  return views
    .filter((v) => v.id !== INBOX_VIEW_ID)
    .map((v) => ({ id: v.id, label: v.name }));
}

function toggleSelectedId(
  selectedIds: number[],
  setSelectedIds: (ids: number[]) => void,
  id: number,
) {
  setSelectedIds(
    selectedIds.includes(id)
      ? selectedIds.filter((selectedId) => selectedId !== id)
      : [...selectedIds, id],
  );
}

export function AddFeedDialog() {
  const [pendingAction, setPendingAction] = useState<
    "feed" | "bookmark" | null
  >(null);
  const [bookmarkFeedback, setBookmarkFeedback] = useState<
    | (BookmarkSaveResult<ApplicationBookmark> & {
        bookmark: ApplicationBookmark;
      })
    | null
  >(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const discovery = useFeedDiscovery();
  const { mutateAsync: createFeed } = useCreateFeedMutation();
  const { mutateAsync: saveBookmark } = useSaveBookmarkMutation();

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
      setPendingAction(null);
      setBookmarkFeedback(null);
      discovery.reset();
    }
  };

  const handleSelectFeed = async (feed: { url: string }) => {
    if (pendingAction) return;
    setPendingAction("feed");

    const createFeedPromise = createFeed({
      url: feed.url,
      categoryIds: [],
      viewIds: [],
    });
    toast.promise(createFeedPromise, {
      loading: "Adding feed...",
      success: "Feed added!",
      error: "Something went wrong adding your feed.",
    });

    try {
      const result = await createFeedPromise;
      const createdFeed = result.feeds[0];
      if (!createdFeed) return;

      discovery.reset();
      launchDialog("edit-feed", { selectedFeedId: createdFeed.id });
    } catch {
      // Error handled by toast.promise
    } finally {
      setPendingAction(null);
    }
  };

  const handleSelectBookmark = async (sourceUrl: string) => {
    if (pendingAction) return;
    setPendingAction("bookmark");
    try {
      const result = await saveBookmark({ sourceUrl });
      setBookmarkFeedback(
        result as BookmarkSaveResult<ApplicationBookmark> & {
          bookmark: ApplicationBookmark;
        },
      );
    } catch {
      toast.error("Could not save Bookmark");
    } finally {
      setPendingAction(null);
    }
  };

  const isOpen = dialog === "add-feed";

  useEffect(() => {
    if (!isOpen) return;

    const content = dialogContentRef.current;
    if (!content) return;

    const updateVisualViewport = () => {
      const viewport = window.visualViewport;
      content.style.setProperty(
        "--feed-command-viewport-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
      content.style.setProperty(
        "--feed-command-viewport-top",
        `${viewport?.offsetTop ?? 0}px`,
      );
    };

    updateVisualViewport();
    window.visualViewport?.addEventListener("resize", updateVisualViewport);
    window.visualViewport?.addEventListener("scroll", updateVisualViewport);
    window.addEventListener("resize", updateVisualViewport);

    return () => {
      window.visualViewport?.removeEventListener(
        "resize",
        updateVisualViewport,
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        updateVisualViewport,
      );
      window.removeEventListener("resize", updateVisualViewport);
    };
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        ref={dialogContentRef}
        hideClose
        overlayClassName="bg-black/40"
        className="top-[var(--feed-command-viewport-top,0px)] left-0 h-[var(--feed-command-viewport-height,100dvh)] max-h-[var(--feed-command-viewport-height,100dvh)] w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden border-0 p-0 sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:border sm:[@media(min-height:600px)]:top-1/3"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          urlInputRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">
          {bookmarkFeedback ? "Organize Bookmark" : "Find a feed or Bookmark"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Paste a website, channel, or RSS feed URL.
        </DialogDescription>
        {bookmarkFeedback ? (
          <BookmarkOrganizationEditor
            bookmarkId={bookmarkFeedback.bookmark.id}
            feedback={bookmarkFeedback}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <FeedDiscoveryCommand
            url={discovery.url}
            onUrlChange={discovery.handleUrlChange}
            onDiscover={discovery.discoverFeeds}
            onSelectFeed={(feed) => void handleSelectFeed(feed)}
            onSelectBookmark={(url) => void handleSelectBookmark(url)}
            bookmarkPlatform={getAssumedFeedPlatform(discovery.url)}
            discoveredFeeds={discovery.discoveredFeeds}
            state={pendingAction ? "adding" : discovery.discoveryState}
            loadingLabel={
              pendingAction === "bookmark"
                ? "Saving Bookmark and capturing page…"
                : "Adding feed…"
            }
            inputRef={urlInputRef}
          />
        )}
        <DialogClose asChild>
          <Button
            className="absolute top-2 right-2 sm:hidden"
            variant="ghost"
            size="icon"
            aria-label="Close"
          >
            <XIcon className="size-4" />
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

function FeedOpenLocationToggleGroup({
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
  const { mutateAsync: createContentCategory } =
    useCreateContentCategoryMutation();

  const [name, setName] = useState<string>("");
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [selectedViewIds, setSelectedViewIds] = useState<number[]>([]);
  const [selectedOpenLocation, setSelectedOpenLocation] =
    useState<FeedOpenLocation>("serial");

  const isFormDisabled = !name;

  const { feeds } = useFeeds();
  const { feedCategories } = useFeedCategories();
  const { viewFeeds } = useViewFeeds();
  const { views } = useViews();
  const { contentCategories } = useContentCategories();
  const viewOptions = useViewOptions();
  const tagOptions = contentCategories.map((category) => ({
    id: category.id,
    label: category.name,
  }));
  const selectedViewIdSet = new Set(selectedViewIds);
  const prioritizedTagIds = new Set<number>();
  for (const view of views) {
    if (!selectedViewIdSet.has(view.id)) continue;

    for (const section of view.viewSections) {
      if (section.itemType === VIEW_LAYOUT_ITEM_TYPE.TAG) {
        prioritizedTagIds.add(section.itemId);
      }
    }
  }

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
      footer={
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
                  name,
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
              onChange={(e) => setName(e.target.value)}
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
                    aria-label={`Open in ${platformName}`}
                  >
                    <ExternalLinkIcon size={16} />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open in {platformName}</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <SelectableChipList
          label="Views"
          options={viewOptions}
          selectedIds={selectedViewIds}
          onToggle={(id) =>
            toggleSelectedId(selectedViewIds, setSelectedViewIds, id)
          }
          onCreate={async (viewName) => {
            try {
              const createdView = await quickCreateView({ name: viewName });
              if (createdView) {
                setSelectedViewIds((ids) =>
                  ids.includes(createdView.id) ? ids : [...ids, createdView.id],
                );
              }
            } catch {
              toast.error("Failed to create view.");
              throw new Error("Failed to create view.");
            }
          }}
          createLabel="Create view"
          createPlaceholder="New view name..."
        />
        <SelectableChipList
          label="Tags"
          options={tagOptions}
          selectedIds={selectedCategories}
          prioritizedIds={prioritizedTagIds}
          onToggle={(id) =>
            toggleSelectedId(selectedCategories, setSelectedCategories, id)
          }
          onCreate={async (tagName) => {
            try {
              const createdTag = await createContentCategory({
                name: tagName,
                feedCategorizations: [],
              });
              if (createdTag) {
                setSelectedCategories((ids) =>
                  ids.includes(createdTag.id) ? ids : [...ids, createdTag.id],
                );
              }
            } catch {
              toast.error("Failed to create tag.");
              throw new Error("Failed to create tag.");
            }
          }}
          createLabel="Create tag"
          createPlaceholder="New tag name..."
        />
        <FeedOpenLocationToggleGroup
          feedPlatform={feed?.platform ?? "youtube"}
          openLocation={selectedOpenLocation}
          setOpenLocation={setSelectedOpenLocation}
        />
      </div>
    </ControlledResponsiveDialog>
  );
}
