"use client";

import { createFileRoute } from "@tanstack/react-router";
import { GlobeIcon, PlayCircleIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { FeedPlatform } from "~/server/db/schema";
import { YoutubeIcon } from "~/components/brand-icons";
import { ViewCategoriesInput } from "~/components/AddViewDialog";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { useDialogStore } from "~/components/feed/dialogStore";
import { FeedManagementTabs } from "~/components/feed/FeedManagementTabs";
import { useFeedManagementShortcuts } from "~/components/feed/useManagementShortcuts";
import { FeedEmptyState } from "~/components/feed/view-lists/EmptyStates";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { ChipCombobox } from "~/components/ui/chip-combobox";
import { Input } from "~/components/ui/input";
import { ControlledResponsiveDialog } from "~/components/ui/responsive-dropdown";
import { Switch } from "~/components/ui/switch";
import { useContentCategories } from "~/lib/data/content-categories";
import { useFeedCategories } from "~/lib/data/feed-categories";
import {
  useBulkAssignFeedCategoryMutation,
  useBulkRemoveFeedCategoryMutation,
} from "~/lib/data/feed-categories/mutations";
import { useFeeds } from "~/lib/data/feeds";
import {
  useBulkDeleteFeedsMutation,
  useSetFeedActiveMutation,
} from "~/lib/data/feeds/mutations";
import { useSubscription } from "~/lib/data/subscription";
import { useViews } from "~/lib/data/views";
import { INBOX_VIEW_ID } from "~/lib/data/views/constants";
import { useQuickCreateViewMutation } from "~/lib/data/views/mutations";
import { useViewFeeds } from "~/lib/data/view-feeds";
import {
  useBulkAssignViewFeedMutation,
  useBulkRemoveViewFeedMutation,
} from "~/lib/data/view-feeds/mutations";

export const Route = createFileRoute("/_app/feeds")({
  component: ManageFeedsPage,
});

function PlatformIcon({ platform }: { platform: FeedPlatform }) {
  switch (platform) {
    case "youtube":
      return <YoutubeIcon size={16} />;
    case "peertube":
      return <PlayCircleIcon size={16} />;
    case "website":
    default:
      return <GlobeIcon size={16} />;
  }
}

function FeedImage({
  imageUrl,
  name,
  platform,
}: {
  imageUrl: string;
  name: string;
  platform: FeedPlatform;
}) {
  if (!imageUrl) {
    return (
      <div className="bg-muted text-muted-foreground grid size-7 shrink-0 place-items-center rounded">
        <PlatformIcon platform={platform} />
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={name}
      className="size-7 shrink-0 rounded object-cover"
    />
  );
}

function ManageFeedsPage() {
  const { feeds } = useFeeds();
  const { feedCategories } = useFeedCategories();
  const { contentCategories } = useContentCategories();
  const { views } = useViews();
  const { viewFeeds } = useViewFeeds();
  const { launchDialog } = useDialogStore();
  const { billingEnabled, activeFeeds, maxActiveFeeds, planName } =
    useSubscription();
  const { mutate: setFeedActive, isPending: isTogglingActive } =
    useSetFeedActiveMutation();

  const [selectedFeedIds, setSelectedFeedIds] = useState<Set<number>>(
    new Set(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!headerRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsScrolled(!entry?.isIntersecting);
      },
      { threshold: 0 },
    );

    observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!bottomRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsAtBottom(entry?.isIntersecting ?? false);
      },
      { threshold: 0 },
    );

    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, []);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [selectedViewIds, setSelectedViewIds] = useState<number[]>([]);

  const { mutateAsync: bulkDeleteFeeds, isPending: isDeletingFeeds } =
    useBulkDeleteFeedsMutation();
  const { mutateAsync: bulkAssignCategory, isPending: isAssigningCategory } =
    useBulkAssignFeedCategoryMutation();
  const { mutateAsync: bulkRemoveCategory, isPending: isRemovingCategory } =
    useBulkRemoveFeedCategoryMutation();
  const { mutateAsync: bulkAssignView, isPending: isAssigningView } =
    useBulkAssignViewFeedMutation();
  const { mutateAsync: bulkRemoveView, isPending: isRemovingView } =
    useBulkRemoveViewFeedMutation();
  const { mutateAsync: quickCreateView } = useQuickCreateViewMutation();

  const feedCategoriesMap = useMemo(() => {
    const map = new Map<number, number[]>();
    feedCategories.forEach((fc) => {
      const existing = map.get(fc.feedId) ?? [];
      existing.push(fc.categoryId);
      map.set(fc.feedId, existing);
    });
    return map;
  }, [feedCategories]);

  const feedViewsMap = useMemo(() => {
    const map = new Map<number, number[]>();
    viewFeeds.forEach((vf) => {
      const existing = map.get(vf.feedId) ?? [];
      existing.push(vf.viewId);
      map.set(vf.feedId, existing);
    });
    return map;
  }, [viewFeeds]);

  const categoryNamesMap = useMemo(() => {
    const map = new Map<number, string>();
    contentCategories.forEach((c) => {
      map.set(c.id, c.name);
    });
    return map;
  }, [contentCategories]);

  const viewNamesMap = useMemo(() => {
    const map = new Map<number, string>();
    views
      .filter((v) => v.id !== INBOX_VIEW_ID)
      .forEach((v) => {
        map.set(v.id, v.name);
      });
    return map;
  }, [views]);

  const customViewOptions = useMemo(() => {
    return views
      .filter((v) => v.id !== INBOX_VIEW_ID)
      .map((v) => ({ id: v.id, label: v.name }));
  }, [views]);

  const filteredFeeds = useMemo(() => {
    const sorted = [...feeds].sort((a, b) => a.name.localeCompare(b.name));
    if (!searchQuery.trim()) return sorted;

    const lowercaseQuery = searchQuery.toLowerCase();
    return sorted.filter((feed) =>
      feed.name.toLowerCase().includes(lowercaseQuery),
    );
  }, [feeds, searchQuery]);

  const selectedCount = selectedFeedIds.size;
  const allSelected =
    filteredFeeds.length > 0 && selectedCount === filteredFeeds.length;

  const toggleFeedSelection = (feedId: number) => {
    setSelectedFeedIds((prev) => {
      const next = new Set(prev);
      if (next.has(feedId)) {
        next.delete(feedId);
      } else {
        next.add(feedId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedFeedIds(new Set(filteredFeeds.map((f) => f.id)));
  };

  const deselectAll = () => {
    setSelectedFeedIds(new Set());
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      deselectAll();
    } else {
      selectAll();
    }
  };

  const handleDelete = () => {
    const feedIds = Array.from(selectedFeedIds);
    const count = feedIds.length;
    setShowDeleteDialog(false);
    setSelectedFeedIds(new Set());

    toast.promise(bulkDeleteFeeds({ feedIds }), {
      loading: `Deleting ${count} feed${count > 1 ? "s" : ""}...`,
      success: `Deleted ${count} feed${count > 1 ? "s" : ""}!`,
      error: "Failed to delete feeds",
    });
  };

  const getSharedCategories = () => {
    const feedIds = Array.from(selectedFeedIds);
    if (feedIds.length === 0) return [];

    const firstFeedCategories = feedCategoriesMap.get(feedIds[0]!) ?? [];
    return firstFeedCategories.filter((categoryId) =>
      feedIds.every((feedId) =>
        feedCategoriesMap.get(feedId)?.includes(categoryId),
      ),
    );
  };

  const getSharedViews = () => {
    const feedIds = Array.from(selectedFeedIds);
    if (feedIds.length === 0) return [];

    const firstFeedViews = feedViewsMap.get(feedIds[0]!) ?? [];
    return firstFeedViews.filter((viewId) =>
      feedIds.every((feedId) => feedViewsMap.get(feedId)?.includes(viewId)),
    );
  };

  const openEditDialog = () => {
    setSelectedCategoryIds(getSharedCategories());
    setSelectedViewIds(getSharedViews());
    setShowEditDialog(true);
  };

  const handleClear = () => {
    const feedIds = Array.from(selectedFeedIds);
    const count = feedIds.length;

    // Get all categories any selected feed currently has
    const allCurrentCategories = new Set<number>();
    feedIds.forEach((feedId) => {
      const categories = feedCategoriesMap.get(feedId) ?? [];
      categories.forEach((c) => allCurrentCategories.add(c));
    });

    // Get all views any selected feed currently has
    const allCurrentViews = new Set<number>();
    feedIds.forEach((feedId) => {
      const views = feedViewsMap.get(feedId) ?? [];
      views.forEach((v) => allCurrentViews.add(v));
    });

    if (allCurrentCategories.size === 0 && allCurrentViews.size === 0) return;

    const promises: Array<Promise<void>> = [
      ...Array.from(allCurrentCategories).map((categoryId) =>
        bulkRemoveCategory({ feedIds, categoryId }),
      ),
      ...Array.from(allCurrentViews).map((viewId) =>
        bulkRemoveView({ feedIds, viewId }),
      ),
    ];

    toast.promise(Promise.all(promises), {
      loading: `Clearing ${count} feed${count > 1 ? "s" : ""}...`,
      success: `Cleared ${count} feed${count > 1 ? "s" : ""}!`,
      error: "Failed to clear feeds",
    });
  };

  useFeedManagementShortcuts({
    onEscape: deselectAll,
    onSelectAll: toggleSelectAll,
    onEdit: openEditDialog,
    onClear: handleClear,
    onDelete: () => setShowDeleteDialog(true),
    isDialogOpen: showDeleteDialog || showEditDialog,
    hasSelection: selectedCount > 0,
  });

  const handleEditSave = () => {
    const feedIds = Array.from(selectedFeedIds);
    const count = feedIds.length;
    const sharedCategories = getSharedCategories();
    const sharedViews = getSharedViews();

    const promises: Array<Promise<void>> = [];

    // Categories
    const categoriesToAdd = selectedCategoryIds;
    const categoriesToRemove = sharedCategories.filter(
      (id) => !selectedCategoryIds.includes(id),
    );
    categoriesToAdd.forEach((categoryId) => {
      promises.push(bulkAssignCategory({ feedIds, categoryId }));
    });
    categoriesToRemove.forEach((categoryId) => {
      promises.push(bulkRemoveCategory({ feedIds, categoryId }));
    });

    // Views
    const viewsToAdd = selectedViewIds;
    const viewsToRemove = sharedViews.filter(
      (id) => !selectedViewIds.includes(id),
    );
    viewsToAdd.forEach((viewId) => {
      promises.push(bulkAssignView({ feedIds, viewId }));
    });
    viewsToRemove.forEach((viewId) => {
      promises.push(bulkRemoveView({ feedIds, viewId }));
    });

    setSelectedCategoryIds([]);
    setSelectedViewIds([]);
    setShowEditDialog(false);

    if (promises.length === 0) {
      return;
    }

    toast.promise(Promise.all(promises), {
      loading: `Updating ${count} feed${count > 1 ? "s" : ""}...`,
      success: `Updated ${count} feed${count > 1 ? "s" : ""}!`,
      error: "Failed to update feeds",
    });
  };

  if (!feeds.length) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="flex items-center justify-between">
          <FeedManagementTabs value="feeds" />
          <Button
            variant="outline"
            size="icon"
            onClick={() => launchDialog("add-feed")}
          >
            <PlusIcon size={16} />
          </Button>
        </div>
        <FeedEmptyState />
      </div>
    );
  }

  return (
    <div>
      <div ref={headerRef} className="mx-auto max-w-3xl px-6 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <FeedManagementTabs value="feeds" />
            {billingEnabled && maxActiveFeeds > 0 && (
              <p className="text-muted-foreground mt-1 text-sm">
                {activeFeeds} / {maxActiveFeeds} feeds active
              </p>
            )}
          </div>
          <ButtonWithShortcut
            variant="outline"
            size="icon"
            onClick={() => launchDialog("add-feed")}
            shortcut="a"
          >
            <PlusIcon size={16} />
          </ButtonWithShortcut>
        </div>
        {billingEnabled &&
          maxActiveFeeds > 0 &&
          activeFeeds >= maxActiveFeeds && (
            <Alert className="mt-4">
              <AlertTitle>Max active feeds reached</AlertTitle>
              <AlertDescription>
                The {planName} plan supports a maximum of {maxActiveFeeds}{" "}
                feeds. You can add more than this, but only your active feeds
                will receive new content.
                <Button
                  type="button"
                  onClick={() => launchDialog("subscription")}
                  className="mt-4"
                >
                  Upgrade your plan
                </Button>
              </AlertDescription>
            </Alert>
          )}
      </div>

      <div
        className={`bg-background sticky top-0 z-10 border-b transition-[border-color] ${
          isScrolled ? "border-border" : "border-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <Input
            placeholder="Search feeds..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
          />
          <div className="flex gap-2">
            <ButtonWithShortcut
              variant="outline"
              onClick={selectAll}
              disabled={allSelected}
              shortcut="s"
            >
              Select All
            </ButtonWithShortcut>
            <ButtonWithShortcut
              variant="outline"
              onClick={deselectAll}
              disabled={selectedCount === 0}
              shortcut="esc"
            >
              Deselect All
            </ButtonWithShortcut>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6">
        <div className="-mx-3">
          {filteredFeeds.map((feed) => {
            const isSelected = selectedFeedIds.has(feed.id);
            const feedCategoryIds = (feedCategoriesMap.get(feed.id) ?? [])
              .slice()
              .sort((a, b) =>
                (categoryNamesMap.get(a) ?? "").localeCompare(
                  categoryNamesMap.get(b) ?? "",
                ),
              );
            const feedViewIds = (feedViewsMap.get(feed.id) ?? [])
              .slice()
              .sort((a, b) =>
                (viewNamesMap.get(a) ?? "").localeCompare(
                  viewNamesMap.get(b) ?? "",
                ),
              );

            return (
              <button
                type="button"
                key={feed.id}
                className={`hover:bg-muted/50 flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-3 text-left transition-colors ${
                  !feed.isActive ? "opacity-50" : ""
                }`}
                onClick={() => toggleFeedSelection(feed.id)}
              >
                <Checkbox
                  id={`feed-${feed.id}`}
                  checked={isSelected}
                  onCheckedChange={() => toggleFeedSelection(feed.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <FeedImage
                  imageUrl={feed.imageUrl}
                  name={feed.name}
                  platform={feed.platform}
                />
                <span className="line-clamp-1 flex-1">{feed.name}</span>
                <div className="flex flex-wrap items-center gap-3">
                  {feedCategoryIds.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {feedCategoryIds.map((categoryId) => {
                        const categoryName = categoryNamesMap.get(categoryId);
                        if (!categoryName) return null;
                        return (
                          <Badge key={`cat-${categoryId}`} variant="outline">
                            {categoryName}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  {feedViewIds.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {feedViewIds.map((viewId) => {
                        const viewName = viewNamesMap.get(viewId);
                        if (!viewName) return null;
                        return (
                          <Badge key={`view-${viewId}`} variant="secondary">
                            {viewName}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>
                <Switch
                  checked={feed.isActive}
                  disabled={isTogglingActive}
                  onCheckedChange={(checked) => {
                    if (
                      !checked ||
                      activeFeeds < maxActiveFeeds ||
                      maxActiveFeeds < 0
                    ) {
                      setFeedActive({ feedId: feed.id, isActive: checked });
                    } else {
                      toast.error(
                        "Feed limit reached. Upgrade your plan to activate more feeds.",
                      );
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </button>
            );
          })}

          {filteredFeeds.length === 0 && searchQuery && (
            <p className="text-muted-foreground py-8 text-center">
              No feeds match &quot;{searchQuery}&quot;
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {selectedCount > 0 && (
        <div
          className={`bg-background sticky bottom-0 z-10 border-t transition-[border-color] ${
            isAtBottom ? "border-transparent" : "border-border"
          }`}
        >
          <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
            <div className="flex gap-2">
              <ButtonWithShortcut
                variant="outline"
                onClick={openEditDialog}
                disabled={
                  isAssigningCategory ||
                  isRemovingCategory ||
                  isAssigningView ||
                  isRemovingView
                }
                shortcut="e"
              >
                Edit
              </ButtonWithShortcut>
              <ButtonWithShortcut
                variant="outline"
                onClick={handleClear}
                disabled={isRemovingCategory || isRemovingView}
                shortcut="c"
              >
                Clear
              </ButtonWithShortcut>
            </div>
            <ButtonWithShortcut
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isDeletingFeeds}
              shortcut="d"
            >
              <Trash2Icon size={16} className="mr-2" />
              Delete ({selectedCount})
            </ButtonWithShortcut>
          </div>
        </div>
      )}

      <ControlledResponsiveDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Feeds"
        description={`Are you sure you want to delete ${selectedCount} feed${selectedCount > 1 ? "s" : ""}? This action cannot be undone.`}
      >
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setShowDeleteDialog(false)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={handleDelete}
            disabled={isDeletingFeeds}
          >
            {isDeletingFeeds ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </ControlledResponsiveDialog>

      <ControlledResponsiveDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        title="Edit Feeds"
        description={`Edit ${selectedCount} feed${selectedCount > 1 ? "s" : ""}.`}
      >
        <div className="grid gap-4">
          <ChipCombobox
            label="Views"
            placeholder="Search views..."
            options={customViewOptions}
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
            selectedCategories={selectedCategoryIds}
            setSelectedCategories={setSelectedCategoryIds}
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowEditDialog(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleEditSave}
              disabled={
                isAssigningCategory ||
                isRemovingCategory ||
                isAssigningView ||
                isRemovingView
              }
            >
              {isAssigningCategory ||
              isRemovingCategory ||
              isAssigningView ||
              isRemovingView
                ? "Saving..."
                : "Save"}
            </Button>
          </div>
        </div>
      </ControlledResponsiveDialog>
    </div>
  );
}
