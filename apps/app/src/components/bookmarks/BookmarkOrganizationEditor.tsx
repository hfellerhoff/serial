"use client";

import { BookmarkEditor } from "@serial/ui";
import { Loader2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { BookmarkSaveResult } from "~/server/bookmarks/contracts";
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
    <BookmarkEditor
      headerClassName="pr-12"
      bookmark={bookmark}
      feedback={feedback}
      viewOptions={viewOptions}
      selectedViewIds={selectedViewIds}
      onToggleView={(id) => void toggleView(id)}
      onCreateView={async (name) => {
        const createdView = await quickCreateView({ name });
        if (!createdView) return;
        setSelectedViewIds((ids) => [...ids, createdView.id]);
        await setBookmarkView({
          bookmarkId,
          viewId: createdView.id,
          assigned: true,
        });
      }}
      tagOptions={tagOptions}
      selectedTagIds={selectedTagIds}
      prioritizedTagIds={prioritizedTagIds}
      onToggleTag={(id) => void toggleTag(id)}
      onCreateTag={async (name) => {
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
      isDeleting={isDeleting}
      onDelete={async () => {
        await deleteBookmark({ bookmarkId });
        toast.success("Bookmark deleted");
        onClose();
      }}
      onDone={onClose}
    />
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
          <div
            data-slot="bookmark-editor-dialog-viewport"
            className="max-h-[min(100dvh,44rem)] min-w-0 overflow-x-hidden overflow-y-auto"
          >
            <BookmarkOrganizationEditor
              bookmarkId={bookmarkId}
              onClose={onClose}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
