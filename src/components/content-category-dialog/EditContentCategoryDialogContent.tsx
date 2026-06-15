"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CategoryFeedsInput } from "./CategoryFeedsInput";
import { CategoryNameInput } from "./CategoryNameInput";
import type { FeedCategorization } from "~/server/api/routers/contentCategoriesRouter";
import { Button } from "~/components/ui/button";
import { ControlledResponsiveDialog } from "~/components/ui/responsive-dropdown";
import {
  useDeleteContentCategoryMutation,
  useUpdateContentCategoryMutation,
} from "~/lib/data/content-categories/mutations";

export function EditContentCategoryDialogContent({
  selectedContentCategoryId,
  initialName,
  initialFeedIds,
  onClose,
}: {
  selectedContentCategoryId: null | number;
  initialName: string;
  initialFeedIds: number[];
  onClose: () => void;
}) {
  const [isUpdatingContentCategory, setIsUpdatingContentCategory] =
    useState(false);
  const [isDeletingContentCategory, setIsDeletingContentCategory] =
    useState(false);
  const { mutateAsync: updateContentCategory } =
    useUpdateContentCategoryMutation();
  const { mutateAsync: deleteContentCategory } =
    useDeleteContentCategoryMutation();
  const [name, setName] = useState(initialName);
  const [selectedFeedIds, setSelectedFeedIds] = useState(initialFeedIds);
  const isFormDisabled = !name;

  return (
    <ControlledResponsiveDialog
      open={selectedContentCategoryId !== null}
      onOpenChange={onClose}
      title="Edit Tag"
      footer={
        <div className="flex gap-2">
          <Button
            disabled={isDeletingContentCategory}
            className="flex-1"
            variant="destructive"
            onClick={() => {
              if (selectedContentCategoryId === null) return;

              setIsDeletingContentCategory(true);
              try {
                const deleteCategoryPromise = deleteContentCategory({
                  id: selectedContentCategoryId,
                });
                toast.promise(deleteCategoryPromise, {
                  loading: "Deleting tag...",
                  success: () => {
                    return "Tag deleted!";
                  },
                  error: () => {
                    return "Something went wrong deleting your tag.";
                  },
                });
                onClose();
              } catch {
                // Error handled by toast.promise
              }

              setIsDeletingContentCategory(false);
            }}
          >
            {isDeletingContentCategory ? "Deleting..." : "Delete"}
          </Button>
          <Button
            disabled={isFormDisabled || isUpdatingContentCategory}
            onClick={() => {
              if (selectedContentCategoryId === null) return;

              setIsUpdatingContentCategory(true);
              try {
                const feedCategorizations: FeedCategorization[] = [];
                const initialFeedIdSet = new Set(initialFeedIds);
                const selectedFeedIdSet = new Set(selectedFeedIds);
                for (const feedId of selectedFeedIds) {
                  if (!initialFeedIdSet.has(feedId)) {
                    feedCategorizations.push({ feedId, selected: true });
                  }
                }
                for (const feedId of initialFeedIds) {
                  if (!selectedFeedIdSet.has(feedId)) {
                    feedCategorizations.push({ feedId, selected: false });
                  }
                }
                const updateCategoryPromise = updateContentCategory({
                  name,
                  id: selectedContentCategoryId,
                  feedCategorizations,
                });
                toast.promise(updateCategoryPromise, {
                  loading: "Updating tag...",
                  success: () => {
                    return "Tag updated!";
                  },
                  error: () => {
                    return "Something went wrong updating your tag.";
                  },
                });
                onClose();
              } catch {
                // Error handled by toast.promise
              }

              setIsUpdatingContentCategory(false);
            }}
            className="flex-1"
          >
            {isUpdatingContentCategory ? "Saving..." : "Save"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-6">
        <CategoryNameInput name={name} setName={setName} />
        <CategoryFeedsInput
          selectedFeedIds={selectedFeedIds}
          setSelectedFeedIds={setSelectedFeedIds}
        />
      </div>
    </ControlledResponsiveDialog>
  );
}
