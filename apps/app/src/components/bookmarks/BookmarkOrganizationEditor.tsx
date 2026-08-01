"use client";

import { BookmarkCheckIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  BookmarkCaptureOutcome,
  BookmarkSaveResult,
} from "~/server/bookmarks/contracts";
import { VIEW_LAYOUT_ITEM_TYPE } from "~/server/db/constants";
import { useBookmarkValue } from "~/lib/data/bookmarks";
import {
  useDeleteBookmarkMutation,
  useSetBookmarkTagMutation,
  useSetBookmarkViewMutation,
} from "~/lib/data/bookmarks/mutations";
import { useContentCategories } from "~/lib/data/content-categories";
import { useCreateContentCategoryMutation } from "~/lib/data/content-categories/mutations";
import { useViews } from "~/lib/data/views";
import { useQuickCreateViewMutation } from "~/lib/data/views/mutations";
import { INBOX_VIEW_ID } from "~/lib/data/views/constants";
import { Button } from "~/components/ui/button";
import { SelectableChipList } from "~/components/ui/selectable-chip-list";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/ui/dialog";

type SaveFeedback = Pick<
  BookmarkSaveResult<unknown>,
  "capture" | "disposition"
>;

const CAPTURE_FAILURE_MESSAGES: Record<
  Exclude<BookmarkCaptureOutcome, { status: "captured" }>["reason"],
  string
> = {
  blocked_target: "This address cannot be captured safely.",
  timeout: "The page took too long to capture.",
  http_error: "The page did not return usable content.",
  not_html: "The address did not return a web page.",
  too_large: "The page was too large to capture.",
  unextractable: "Serial could not extract reader-oriented content.",
  invalid_capture: "The extracted page did not pass Serial’s safety checks.",
  unsupported_capture_version: "This capture format is not supported.",
  rate_limited: "Capture is temporarily rate limited.",
  capacity_limited: "Capture capacity is temporarily unavailable.",
};

function CaptureFeedback({ feedback }: { feedback: SaveFeedback }) {
  if (feedback.capture.status === "captured") {
    if (feedback.disposition === "created") return null;
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <RefreshCwIcon className="size-4" />
        Existing Bookmark refreshed. Its Views and Tags were preserved.
      </p>
    );
  }

  const preserved = feedback.capture.status === "preserved";
  return (
    <p className="text-muted-foreground text-sm" role="status">
      {CAPTURE_FAILURE_MESSAGES[feedback.capture.reason]}{" "}
      {preserved
        ? "The previous Page capture is still available."
        : "This Bookmark will open the original page."}
    </p>
  );
}

export function BookmarkOrganizationEditor({
  bookmarkId,
  feedback,
  onClose,
}: {
  bookmarkId: string;
  feedback?: SaveFeedback;
  onClose: () => void;
}) {
  const bookmark = useBookmarkValue(bookmarkId);
  const { views } = useViews();
  const { contentCategories } = useContentCategories();
  const [selectedViewIds, setSelectedViewIds] = useState<number[]>(
    () => bookmark?.viewIds ?? [],
  );
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(
    () => bookmark?.tagIds ?? [],
  );
  const { mutateAsync: setBookmarkView } = useSetBookmarkViewMutation();
  const { mutateAsync: setBookmarkTag } = useSetBookmarkTagMutation();
  const { mutateAsync: deleteBookmark, isPending: isDeleting } =
    useDeleteBookmarkMutation();
  const { mutateAsync: quickCreateView } = useQuickCreateViewMutation();
  const { mutateAsync: createContentCategory } =
    useCreateContentCategoryMutation();

  const viewOptions = views
    .filter((view) => view.id !== INBOX_VIEW_ID)
    .map((view) => ({ id: view.id, label: view.name }));
  const tagOptions = contentCategories.map((tag) => ({
    id: tag.id,
    label: tag.name,
  }));
  const prioritizedTagIds = useMemo(() => {
    const selectedViewIdSet = new Set(selectedViewIds);
    return views.reduce((tagIds, view) => {
      if (!selectedViewIdSet.has(view.id)) return tagIds;
      for (const section of view.viewSections) {
        if (section.itemType === VIEW_LAYOUT_ITEM_TYPE.TAG) {
          tagIds.add(section.itemId);
        }
      }
      return tagIds;
    }, new Set<number>());
  }, [selectedViewIds, views]);
  const showFeedback =
    feedback !== undefined &&
    !(
      feedback.capture.status === "captured" &&
      feedback.disposition === "created"
    );

  if (!bookmark) {
    return (
      <div className="flex min-h-64 items-center justify-center" role="status">
        <Loader2Icon className="size-5 animate-spin" />
        <span className="sr-only">Loading Bookmark</span>
      </div>
    );
  }

  const toggleView = async (viewId: number) => {
    const assigned = !selectedViewIds.includes(viewId);
    setSelectedViewIds((ids) =>
      assigned ? [...ids, viewId] : ids.filter((id) => id !== viewId),
    );
    try {
      await setBookmarkView({ bookmarkId, viewId, assigned });
    } catch {
      setSelectedViewIds((ids) =>
        assigned ? ids.filter((id) => id !== viewId) : [...ids, viewId],
      );
    }
  };

  const toggleTag = async (tagId: number) => {
    const assigned = !selectedTagIds.includes(tagId);
    setSelectedTagIds((ids) =>
      assigned ? [...ids, tagId] : ids.filter((id) => id !== tagId),
    );
    try {
      await setBookmarkTag({ bookmarkId, tagId, assigned });
    } catch {
      setSelectedTagIds((ids) =>
        assigned ? ids.filter((id) => id !== tagId) : [...ids, tagId],
      );
    }
  };

  return (
    <div className="flex max-h-[min(100dvh,44rem)] min-h-0 flex-col">
      <div className="border-b px-6 py-5 pr-12">
        <div className="flex items-start gap-3">
          <div className="bg-muted text-muted-foreground mt-0.5 flex size-9 shrink-0 items-center justify-center rounded">
            <BookmarkCheckIcon className="size-4" />
          </div>
          <div className="min-w-0">
            <h2 className="line-clamp-2 font-semibold">{bookmark.title}</h2>
            <p className="text-muted-foreground truncate text-sm">
              {bookmark.author || new URL(bookmark.sourceUrl).hostname}
            </p>
          </div>
        </div>
        {feedback && showFeedback && (
          <div className="mt-4" data-testid="bookmark-capture-feedback">
            <CaptureFeedback feedback={feedback} />
          </div>
        )}
      </div>

      <div className="grid min-h-0 gap-6 overflow-y-auto px-6 py-5">
        <SelectableChipList
          label="Views"
          options={viewOptions}
          selectedIds={selectedViewIds}
          onToggle={(id) => void toggleView(id)}
          onCreate={async (name) => {
            const createdView = await quickCreateView({ name });
            if (!createdView) return;
            setSelectedViewIds((ids) => [...ids, createdView.id]);
            await setBookmarkView({
              bookmarkId,
              viewId: createdView.id,
              assigned: true,
            });
          }}
          createLabel="Create view"
          createPlaceholder="New view name..."
        />
        <SelectableChipList
          label="Tags"
          options={tagOptions}
          selectedIds={selectedTagIds}
          prioritizedIds={prioritizedTagIds}
          onToggle={(id) => void toggleTag(id)}
          onCreate={async (name) => {
            const createdTag = await createContentCategory({
              name,
              feedCategorizations: [],
            });
            if (!createdTag) return;
            setSelectedTagIds((ids) => [...ids, createdTag.id]);
            await setBookmarkTag({
              bookmarkId,
              tagId: createdTag.id,
              assigned: true,
            });
          }}
          createLabel="Create tag"
          createPlaceholder="New tag name..."
        />
      </div>

      <div className="flex gap-2 border-t px-6 py-4">
        <Button
          variant="destructive"
          className="flex-1"
          disabled={isDeleting}
          aria-label="Delete Bookmark"
          onClick={async () => {
            await deleteBookmark({ bookmarkId });
            toast.success("Bookmark deleted");
            onClose();
          }}
        >
          {isDeleting ? "Deleting..." : "Delete"}
        </Button>
        <Button className="flex-1" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

export function EditBookmarkDialog({
  bookmarkId,
  onClose,
}: {
  bookmarkId: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={bookmarkId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogTitle className="sr-only">Edit Bookmark</DialogTitle>
        <DialogDescription className="sr-only">
          Organize this Bookmark into Views and Tags.
        </DialogDescription>
        {bookmarkId && (
          <BookmarkOrganizationEditor
            bookmarkId={bookmarkId}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
