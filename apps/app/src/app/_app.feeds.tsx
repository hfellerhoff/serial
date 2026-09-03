"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { ItemGroup } from "@serial/ui";
import { ImportIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { useDialogStore } from "~/components/feed/dialogStore";
import { FeedListItem } from "~/components/feed/FeedListItem";
import { FeedManagementTabs } from "~/components/feed/FeedManagementTabs";
import { useFeedManagementShortcuts } from "~/components/feed/useManagementShortcuts";
import { FeedEmptyState } from "~/components/feed/view-lists/EmptyStates";
import { ActiveFeedLimitStatus } from "~/components/feed/manage/ActiveFeedLimitStatus";
import {
  FeedActiveSwitch,
  FeedRowBadges,
} from "~/components/feed/manage/FeedRowControls";
import {
  DeleteFeedsDialog,
  EditFeedsDialog,
} from "~/components/feed/manage/ManageFeedsDialogs";
import { useBulkFeedEditing } from "~/components/feed/manage/useBulkFeedEditing";
import {
  filterFeeds,
  sortIdsByName,
  useFeedMaps,
} from "~/components/feed/manage/useFeedMaps";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { useFeeds } from "~/lib/data/feeds";
import { useSetFeedActiveMutation } from "~/lib/data/feeds/mutations";
import { useSubscription } from "~/lib/data/subscription";
import { useScrollEdgeState } from "~/lib/hooks/useScrollEdgeState";
import { useShiftSelect } from "~/lib/hooks/useShiftSelect";
import { OfflineMutationBoundary } from "~/components/OfflineMutationBoundary";
import { useCanMutate } from "~/lib/data/offline-mutations";

export const Route = createFileRoute("/_app/feeds")({
  component: ManageFeedsPage,
});

function ManageFeedsPage() {
  return (
    <OfflineMutationBoundary>
      <ManageFeedsPageContent />
    </OfflineMutationBoundary>
  );
}

function ManageFeedsPageContent() {
  const canMutate = useCanMutate();
  const { feeds } = useFeeds();
  const { launchDialog } = useDialogStore();
  const { billingEnabled, activeFeeds, maxActiveFeeds, planName } =
    useSubscription();
  const { mutate: setFeedActive, isPending: isTogglingActive } =
    useSetFeedActiveMutation();

  const [selectedFeedIds, setSelectedFeedIds] = useState<Set<number>>(
    new Set(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const { headerRef, bottomRef, isScrolled, isAtBottom } = useScrollEdgeState();

  const {
    feedCategoriesMap,
    feedViewsMap,
    categoryNamesMap,
    viewNamesMap,
    customViewOptions,
  } = useFeedMaps();

  const filteredFeeds = useMemo(
    () =>
      filterFeeds(feeds, searchQuery, {
        feedCategoriesMap,
        feedViewsMap,
        categoryNamesMap,
        viewNamesMap,
      }),
    [
      feeds,
      searchQuery,
      feedCategoriesMap,
      feedViewsMap,
      categoryNamesMap,
      viewNamesMap,
    ],
  );

  const filteredFeedIds = useMemo(
    () => filteredFeeds.map((f) => f.id),
    [filteredFeeds],
  );
  const handleFeedSelect = useShiftSelect(filteredFeedIds, setSelectedFeedIds);

  const selectedCount = selectedFeedIds.size;
  const allSelected =
    filteredFeeds.length > 0 && selectedCount === filteredFeeds.length;

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

  const {
    showDeleteDialog,
    setShowDeleteDialog,
    showEditDialog,
    setShowEditDialog,
    selectedCategoryIds,
    setSelectedCategoryIds,
    selectedViewIds,
    setSelectedViewIds,
    bulkActiveState,
    setBulkActiveState,
    isDeletingFeeds,
    isSavingEdit,
    isClearing,
    handleDelete,
    openEditDialog,
    handleClear,
    handleEditSave,
  } = useBulkFeedEditing({
    canMutate,
    feeds,
    selectedFeedIds,
    setSelectedFeedIds,
    feedCategoriesMap,
    feedViewsMap,
    activeFeeds,
    maxActiveFeeds,
    launchDialog,
  });

  useFeedManagementShortcuts({
    onEscape: deselectAll,
    onSelectAll: toggleSelectAll,
    onEdit: openEditDialog,
    onClear: handleClear,
    onDelete: () => setShowDeleteDialog(true),
    isDialogOpen: showDeleteDialog || showEditDialog,
    hasSelection: selectedCount > 0,
  });

  if (!feeds.length) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="flex items-center justify-between">
          <FeedManagementTabs value="feeds" />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon md:default" asChild>
              <Link to="/import" aria-label="Bulk Import">
                <ImportIcon size={16} />
                <span className="hidden md:block">Bulk Import</span>
              </Link>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => launchDialog("add-feed")}
            >
              <PlusIcon size={16} />
            </Button>
          </div>
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
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon md:default" asChild>
              <Link to="/import" aria-label="Bulk Import">
                <ImportIcon size={16} />
                <span className="hidden md:block">Bulk Import</span>
              </Link>
            </Button>
            <ButtonWithShortcut
              variant="outline"
              size="icon"
              onClick={() => launchDialog("add-feed")}
              shortcut="a"
            >
              <PlusIcon size={16} />
            </ButtonWithShortcut>
          </div>
        </div>
        <ActiveFeedLimitStatus
          billingEnabled={billingEnabled}
          activeFeeds={activeFeeds}
          maxActiveFeeds={maxActiveFeeds}
          planName={planName}
          launchDialog={launchDialog}
        />
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
        <ItemGroup className="-mx-3 gap-0">
          {filteredFeeds.map((feed) => {
            const isSelected = selectedFeedIds.has(feed.id);
            const feedCategoryIds = sortIdsByName(
              feedCategoriesMap.get(feed.id) ?? [],
              categoryNamesMap,
            );
            const feedViewIds = sortIdsByName(
              feedViewsMap.get(feed.id) ?? [],
              viewNamesMap,
            );

            return (
              <FeedListItem
                key={feed.id}
                title={feed.name}
                platform={feed.platform}
                imageUrl={feed.imageUrl}
                interactive
                inactive={!feed.isActive}
                onClick={(e) => handleFeedSelect(feed.id, e)}
                leading={
                  <Checkbox
                    id={`feed-${feed.id}`}
                    checked={isSelected}
                    onCheckedChange={() => handleFeedSelect(feed.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                }
                details={
                  <>
                    <FeedRowBadges
                      ids={feedCategoryIds}
                      namesMap={categoryNamesMap}
                      variant="outline"
                      keyPrefix="cat"
                    />
                    <FeedRowBadges
                      ids={feedViewIds}
                      namesMap={viewNamesMap}
                      variant="secondary"
                      keyPrefix="view"
                    />
                  </>
                }
                actions={
                  <FeedActiveSwitch
                    feed={feed}
                    isTogglingActive={isTogglingActive}
                    setFeedActive={setFeedActive}
                    activeFeeds={activeFeeds}
                    maxActiveFeeds={maxActiveFeeds}
                  />
                }
              />
            );
          })}

          {filteredFeeds.length === 0 && searchQuery && (
            <p className="text-muted-foreground py-8 text-center">
              No feeds match &quot;{searchQuery}&quot;
            </p>
          )}
          <div ref={bottomRef} />
        </ItemGroup>
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
                disabled={isSavingEdit}
                shortcut="e"
              >
                Edit
              </ButtonWithShortcut>
              <ButtonWithShortcut
                variant="outline"
                onClick={handleClear}
                disabled={isClearing}
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

      <DeleteFeedsDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        selectedCount={selectedCount}
        canMutate={canMutate}
        isDeletingFeeds={isDeletingFeeds}
        onDelete={handleDelete}
      />

      <EditFeedsDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        selectedCount={selectedCount}
        bulkActiveState={bulkActiveState}
        setBulkActiveState={setBulkActiveState}
        canMutate={canMutate}
        isSaving={isSavingEdit}
        onSave={handleEditSave}
        customViewOptions={customViewOptions}
        selectedViewIds={selectedViewIds}
        setSelectedViewIds={setSelectedViewIds}
        selectedCategoryIds={selectedCategoryIds}
        setSelectedCategoryIds={setSelectedCategoryIds}
      />
    </div>
  );
}
