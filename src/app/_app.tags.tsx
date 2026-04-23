"use client";

import { createFileRoute } from "@tanstack/react-router";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BulkAssignFeedsToTagsDialog,
  EditContentCategoryDialog,
} from "~/components/AddContentCategoryDialog";
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
import {
  useDeleteContentCategoryMutation,
  useUpdateContentCategoryMutation,
} from "~/lib/data/content-categories/mutations";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { useFeeds } from "~/lib/data/feeds";
import { useViews } from "~/lib/data/views";
import { INBOX_VIEW_ID } from "~/lib/data/views/constants";
import { useShiftSelect } from "~/lib/hooks/useShiftSelect";
import { useShortcut } from "~/lib/hooks/useShortcut";

export const Route = createFileRoute("/_app/tags")({
  component: ManageTagsPage,
});

function ManageTagsPage() {
  const { contentCategories } = useContentCategories();
  const { feedCategories } = useFeedCategories();
  const { feeds } = useFeeds();
  const { views } = useViews();
  const { launchDialog } = useDialogStore();
  useShortcut("a", (event) => {
    event.preventDefault();
    launchDialog("add-content-category");
  });

  const { mutateAsync: updateContentCategory } =
    useUpdateContentCategoryMutation();
  const { mutateAsync: deleteContentCategory, isPending: isDeletingTag } =
    useDeleteContentCategoryMutation();

  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkAssignDialog, setShowBulkAssignDialog] = useState(false);
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
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

  const feedNamesMap = useMemo(() => {
    const map = new Map<number, string>();
    feeds.forEach((f) => map.set(f.id, f.name));
    return map;
  }, [feeds]);

  const tagFeedsMap = useMemo(() => {
    const map = new Map<number, number[]>();
    feedCategories.forEach((fc) => {
      const existing = map.get(fc.categoryId) ?? [];
      existing.push(fc.feedId);
      map.set(fc.categoryId, existing);
    });
    return map;
  }, [feedCategories]);

  const tagViewsMap = useMemo(() => {
    const map = new Map<number, number[]>();
    views.forEach((v) => {
      if (v.id === INBOX_VIEW_ID) return;
      v.categoryIds.forEach((categoryId) => {
        const existing = map.get(categoryId) ?? [];
        existing.push(v.id);
        map.set(categoryId, existing);
      });
    });
    return map;
  }, [views]);

  const viewNamesMap = useMemo(() => {
    const map = new Map<number, string>();
    views
      .filter((v) => v.id !== INBOX_VIEW_ID)
      .forEach((v) => {
        map.set(v.id, v.name);
      });
    return map;
  }, [views]);

  const filteredTags = useMemo(() => {
    const sorted = [...contentCategories].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    if (!searchQuery.trim()) return sorted;
    const q = searchQuery.toLowerCase();
    const matches = (name: string | undefined) =>
      !!name && name.toLowerCase().includes(q);

    return sorted.filter((c) => {
      if (matches(c.name)) return true;

      const feedIds = tagFeedsMap.get(c.id);
      if (feedIds?.some((id) => matches(feedNamesMap.get(id)))) return true;

      const viewIds = tagViewsMap.get(c.id);
      if (viewIds?.some((id) => matches(viewNamesMap.get(id)))) return true;

      return false;
    });
  }, [
    contentCategories,
    searchQuery,
    tagFeedsMap,
    tagViewsMap,
    feedNamesMap,
    viewNamesMap,
  ]);

  const filteredTagIds = useMemo(
    () => filteredTags.map((t) => t.id),
    [filteredTags],
  );
  const handleTagSelect = useShiftSelect(filteredTagIds, setSelectedTagIds);

  const selectedCount = selectedTagIds.size;
  const allSelected =
    filteredTags.length > 0 && selectedCount === filteredTags.length;

  const selectAll = () =>
    setSelectedTagIds(new Set(filteredTags.map((t) => t.id)));
  const deselectAll = () => setSelectedTagIds(new Set());
  const toggleSelectAll = () => (allSelected ? deselectAll() : selectAll());

  const handleClear = () => {
    const ids = Array.from(selectedTagIds);
    const count = ids.length;
    if (count === 0) return;

    const promises = ids.map((id) => {
      const tag = contentCategories.find((c) => c.id === id);
      if (!tag) return Promise.resolve();
      const currentFeedIds = tagFeedsMap.get(id) ?? [];
      if (currentFeedIds.length === 0) return Promise.resolve();
      return updateContentCategory({
        id,
        name: tag.name,
        feedCategorizations: currentFeedIds.map((feedId) => ({
          feedId,
          selected: false,
        })),
      });
    });

    toast.promise(Promise.all(promises), {
      loading: `Clearing ${count} tag${count > 1 ? "s" : ""}...`,
      success: `Cleared ${count} tag${count > 1 ? "s" : ""}!`,
      error: "Failed to clear tags",
    });
  };

  const handleDelete = async () => {
    const ids = Array.from(selectedTagIds);
    const count = ids.length;
    setShowDeleteDialog(false);
    setSelectedTagIds(new Set());

    toast.promise(Promise.all(ids.map((id) => deleteContentCategory({ id }))), {
      loading: `Deleting ${count} tag${count > 1 ? "s" : ""}...`,
      success: `Deleted ${count} tag${count > 1 ? "s" : ""}!`,
      error: "Failed to delete tags",
    });
  };

  useFeedManagementShortcuts({
    onEscape: deselectAll,
    onSelectAll: toggleSelectAll,
    onEdit: () => setShowBulkAssignDialog(true),
    onClear: handleClear,
    onDelete: () => setShowDeleteDialog(true),
    isDialogOpen:
      showDeleteDialog || showBulkAssignDialog || editingTagId !== null,
    hasSelection: selectedCount > 0,
  });

  if (contentCategories.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="flex items-center justify-between">
          <FeedManagementTabs value="tags" />
          <Button
            variant="outline"
            size="icon"
            onClick={() => launchDialog("add-content-category")}
          >
            <PlusIcon size={16} />
          </Button>
        </div>
        <p className="text-muted-foreground mt-8 text-center">
          No tags yet. Create one to get started.
        </p>
        <EditContentCategoryDialog
          selectedContentCategoryId={editingTagId}
          onClose={() => setEditingTagId(null)}
        />
      </div>
    );
  }

  return (
    <div>
      <div ref={headerRef} className="mx-auto max-w-3xl px-6 pt-6">
        <div className="flex items-center justify-between">
          <FeedManagementTabs value="tags" />
          <ButtonWithShortcut
            variant="outline"
            size="icon"
            onClick={() => launchDialog("add-content-category")}
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
            placeholder="Search tags..."
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
          {filteredTags.map((tag) => {
            const isSelected = selectedTagIds.has(tag.id);
            const feedIds = tagFeedsMap.get(tag.id) ?? [];

            return (
              <button
                type="button"
                key={tag.id}
                className="hover:bg-muted/50 flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-3 text-left transition-colors"
                onClick={(e) => handleTagSelect(tag.id, e)}
              >
                <Checkbox
                  id={`tag-${tag.id}`}
                  checked={isSelected}
                  onCheckedChange={() => handleTagSelect(tag.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="line-clamp-1 flex-1">{tag.name}</span>
                <div className="flex flex-wrap items-center gap-3">
                  {feedIds.length === 1 ? (
                    <Badge variant="secondary">
                      {feedNamesMap.get(feedIds[0]!) ?? "1 Feed"}
                    </Badge>
                  ) : feedIds.length > 1 ? (
                    <Badge variant="secondary">{feedIds.length} Feeds</Badge>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingTagId(tag.id);
                  }}
                >
                  <PencilIcon size={16} />
                </Button>
              </button>
            );
          })}

          {filteredTags.length === 0 && searchQuery && (
            <p className="text-muted-foreground py-8 text-center">
              No tags match &quot;{searchQuery}&quot;
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
                onClick={() => setShowBulkAssignDialog(true)}
                shortcut="e"
              >
                Assign Feeds
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
              disabled={isDeletingTag}
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
        title="Delete Tags"
        description={`Are you sure you want to delete ${selectedCount} tag${selectedCount > 1 ? "s" : ""}? This action cannot be undone.`}
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
            disabled={isDeletingTag}
          >
            {isDeletingTag ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </ControlledResponsiveDialog>

      <BulkAssignFeedsToTagsDialog
        selectedTagIds={Array.from(selectedTagIds)}
        open={showBulkAssignDialog}
        onOpenChange={setShowBulkAssignDialog}
      />

      <EditContentCategoryDialog
        selectedContentCategoryId={editingTagId}
        onClose={() => setEditingTagId(null)}
      />
    </div>
  );
}
