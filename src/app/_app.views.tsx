"use client";

import { createFileRoute } from "@tanstack/react-router";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BulkEditViewsDialog,
  EditViewDialog,
} from "~/components/AddViewDialog";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { useDialogStore } from "~/components/feed/dialogStore";
import { FeedManagementTabs } from "~/components/feed/FeedManagementTabs";
import { useFeedManagementShortcuts } from "~/components/feed/useManagementShortcuts";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { ControlledResponsiveDialog } from "~/components/ui/responsive-dropdown";
import { useContentCategories } from "~/lib/data/content-categories";
import { useFeeds } from "~/lib/data/feeds";
import { useViews } from "~/lib/data/views";
import { INBOX_VIEW_ID } from "~/lib/data/views/constants";
import {
  useDeleteViewMutation,
  useEditViewMutation,
} from "~/lib/data/views/mutations";
import { useShortcut } from "~/lib/hooks/useShortcut";
import { VIEW_READ_STATUS } from "~/server/db/constants";

export const Route = createFileRoute("/_app/views")({
  component: ManageViewsPage,
});

function ManageViewsPage() {
  const { views } = useViews();
  const { feeds } = useFeeds();
  const { contentCategories } = useContentCategories();
  const { launchDialog } = useDialogStore();
  useShortcut("a", (event) => {
    event.preventDefault();
    launchDialog("add-view");
  });

  const { mutateAsync: editView } = useEditViewMutation();
  const { mutateAsync: deleteView, isPending: isDeletingView } =
    useDeleteViewMutation();

  const [selectedViewIds, setSelectedViewIds] = useState<Set<number>>(
    new Set(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  const [editingViewId, setEditingViewId] = useState<number | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!headerRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsScrolled(!entry?.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!bottomRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsAtBottom(entry?.isIntersecting ?? false),
      { threshold: 0 },
    );
    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, []);

  const customViews = useMemo(
    () => views.filter((v) => v.id !== INBOX_VIEW_ID),
    [views],
  );

  const feedNamesMap = useMemo(() => {
    const map = new Map<number, string>();
    feeds.forEach((f) => map.set(f.id, f.name));
    return map;
  }, [feeds]);

  const categoryNamesMap = useMemo(() => {
    const map = new Map<number, string>();
    contentCategories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [contentCategories]);

  const filteredViews = useMemo(() => {
    const sorted = [...customViews].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    if (!searchQuery.trim()) return sorted;
    const q = searchQuery.toLowerCase();
    return sorted.filter((v) => v.name.toLowerCase().includes(q));
  }, [customViews, searchQuery]);

  const selectedCount = selectedViewIds.size;
  const allSelected =
    filteredViews.length > 0 && selectedCount === filteredViews.length;

  const toggleViewSelection = (viewId: number) => {
    setSelectedViewIds((prev) => {
      const next = new Set(prev);
      if (next.has(viewId)) next.delete(viewId);
      else next.add(viewId);
      return next;
    });
  };

  const selectAll = () =>
    setSelectedViewIds(new Set(filteredViews.map((v) => v.id)));
  const deselectAll = () => setSelectedViewIds(new Set());
  const toggleSelectAll = () => (allSelected ? deselectAll() : selectAll());

  const handleClear = () => {
    const ids = Array.from(selectedViewIds);
    const count = ids.length;
    if (count === 0) return;

    const promises = ids.map((id) => {
      const view = views.find((v) => v.id === id);
      if (!view) return Promise.resolve();
      return editView({
        id,
        name: view.name,
        daysWindow: view.daysWindow,
        readStatus: VIEW_READ_STATUS.UNREAD,
        categoryIds: [],
        feedIds: [],
      });
    });

    toast.promise(Promise.all(promises), {
      loading: `Clearing ${count} view${count > 1 ? "s" : ""}...`,
      success: `Cleared ${count} view${count > 1 ? "s" : ""}!`,
      error: "Failed to clear views",
    });
  };

  const handleDelete = async () => {
    const ids = Array.from(selectedViewIds);
    const count = ids.length;
    setShowDeleteDialog(false);
    setSelectedViewIds(new Set());

    toast.promise(Promise.all(ids.map((id) => deleteView({ id }))), {
      loading: `Deleting ${count} view${count > 1 ? "s" : ""}...`,
      success: `Deleted ${count} view${count > 1 ? "s" : ""}!`,
      error: "Failed to delete views",
    });
  };

  useFeedManagementShortcuts({
    onEscape: deselectAll,
    onSelectAll: toggleSelectAll,
    onEdit: () => setShowBulkEditDialog(true),
    onClear: handleClear,
    onDelete: () => setShowDeleteDialog(true),
    isDialogOpen:
      showDeleteDialog || showBulkEditDialog || editingViewId !== null,
    hasSelection: selectedCount > 0,
  });

  if (customViews.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="flex items-center justify-between">
          <FeedManagementTabs value="views" />
          <Button
            variant="outline"
            size="icon"
            onClick={() => launchDialog("add-view")}
          >
            <PlusIcon size={16} />
          </Button>
        </div>
        <p className="text-muted-foreground mt-8 text-center">
          No views yet. Create one to get started.
        </p>
        <EditViewDialog
          selectedViewId={editingViewId}
          onClose={() => setEditingViewId(null)}
        />
      </div>
    );
  }

  return (
    <div>
      <div ref={headerRef} className="mx-auto max-w-3xl px-6 pt-6">
        <div className="flex items-center justify-between">
          <FeedManagementTabs value="views" />
          <ButtonWithShortcut
            variant="outline"
            size="icon"
            onClick={() => launchDialog("add-view")}
            shortcut="a"
          >
            <PlusIcon size={16} />
          </ButtonWithShortcut>
        </div>
      </div>

      <div
        className={`bg-background sticky top-0 z-10 border-b transition-[border-color] ${
          isScrolled ? "border-border" : "border-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <Input
            placeholder="Search views..."
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
          {filteredViews.map((view) => {
            const isSelected = selectedViewIds.has(view.id);
            const feedIds = view.feedIds;
            const categoryIds = view.categoryIds;

            return (
              <button
                type="button"
                key={view.id}
                className="hover:bg-muted/50 flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-3 text-left transition-colors"
                onClick={() => toggleViewSelection(view.id)}
              >
                <Checkbox
                  id={`view-${view.id}`}
                  checked={isSelected}
                  onCheckedChange={() => toggleViewSelection(view.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="line-clamp-1 flex-1">{view.name}</span>
                <div className="flex flex-wrap items-center gap-3">
                  {feedIds.length === 1 ? (
                    <Badge variant="secondary">
                      {feedNamesMap.get(feedIds[0]!) ?? "1 Feed"}
                    </Badge>
                  ) : feedIds.length > 1 ? (
                    <Badge variant="secondary">{feedIds.length} Feeds</Badge>
                  ) : null}
                  {categoryIds.length === 1 ? (
                    <Badge variant="outline">
                      {categoryNamesMap.get(categoryIds[0]!) ?? "1 Tag"}
                    </Badge>
                  ) : categoryIds.length > 1 ? (
                    <Badge variant="outline">{categoryIds.length} Tags</Badge>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingViewId(view.id);
                  }}
                >
                  <PencilIcon size={16} />
                </Button>
              </button>
            );
          })}

          {filteredViews.length === 0 && searchQuery && (
            <p className="text-muted-foreground py-8 text-center">
              No views match &quot;{searchQuery}&quot;
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
                onClick={() => setShowBulkEditDialog(true)}
                shortcut="e"
              >
                Edit
              </ButtonWithShortcut>
              <ButtonWithShortcut
                variant="outline"
                onClick={handleClear}
                shortcut="c"
              >
                Clear
              </ButtonWithShortcut>
            </div>
            <ButtonWithShortcut
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isDeletingView}
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
        title="Delete Views"
        description={`Are you sure you want to delete ${selectedCount} view${selectedCount > 1 ? "s" : ""}? This action cannot be undone.`}
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
            disabled={isDeletingView}
          >
            {isDeletingView ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </ControlledResponsiveDialog>

      <BulkEditViewsDialog
        selectedViewIds={Array.from(selectedViewIds)}
        open={showBulkEditDialog}
        onOpenChange={setShowBulkEditDialog}
      />

      <EditViewDialog
        selectedViewId={editingViewId}
        onClose={() => setEditingViewId(null)}
      />
    </div>
  );
}
