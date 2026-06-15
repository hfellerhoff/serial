"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CategoryFeedsInput } from "./CategoryFeedsInput";
import { Button } from "~/components/ui/button";
import { useContentCategories } from "~/lib/data/content-categories";
import { useUpdateContentCategoryMutation } from "~/lib/data/content-categories/mutations";

export function BulkAssignFeedsToTagsContent({
  selectedTagIds,
  onClose,
}: {
  selectedTagIds: number[];
  onClose: () => void;
}) {
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedFeedIds, setSelectedFeedIds] = useState<number[]>([]);
  const { mutateAsync: updateContentCategory } =
    useUpdateContentCategoryMutation();
  const { contentCategories } = useContentCategories();

  const handleSave = () => {
    if (selectedTagIds.length === 0 || selectedFeedIds.length === 0) {
      onClose();
      return;
    }

    setIsAssigning(true);
    const tagCount = selectedTagIds.length;
    const promises = selectedTagIds.map((tagId) => {
      const tag = contentCategories.find((category) => category.id === tagId);
      if (!tag) return Promise.resolve();

      return updateContentCategory({
        id: tagId,
        name: tag.name,
        feedCategorizations: selectedFeedIds.map((feedId) => ({
          feedId,
          selected: true,
        })),
      });
    });

    toast.promise(Promise.all(promises), {
      loading: `Assigning feeds to ${tagCount} tag${tagCount > 1 ? "s" : ""}...`,
      success: `Assigned feeds to ${tagCount} tag${tagCount > 1 ? "s" : ""}!`,
      error: "Failed to assign feeds",
    });

    onClose();
    setIsAssigning(false);
  };

  return (
    <div className="grid gap-6">
      <CategoryFeedsInput
        selectedFeedIds={selectedFeedIds}
        setSelectedFeedIds={setSelectedFeedIds}
      />
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          onClick={handleSave}
          disabled={isAssigning || selectedFeedIds.length === 0}
        >
          {isAssigning ? "Saving..." : "Assign"}
        </Button>
      </div>
    </div>
  );
}
