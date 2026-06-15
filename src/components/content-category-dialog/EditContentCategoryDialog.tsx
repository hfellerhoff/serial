"use client";

import { EditContentCategoryDialogContent } from "./EditContentCategoryDialogContent";
import { useContentCategories } from "~/lib/data/content-categories";
import { useFeedCategories } from "~/lib/data/feed-categories";

export function EditContentCategoryDialog({
  selectedContentCategoryId,
  onClose,
}: {
  selectedContentCategoryId: null | number;
  onClose: () => void;
}) {
  const { contentCategories } = useContentCategories();
  const { feedCategories } = useFeedCategories();
  const initialFeedIds: number[] = [];
  for (const feedCategory of feedCategories) {
    if (feedCategory.categoryId === selectedContentCategoryId) {
      initialFeedIds.push(feedCategory.feedId);
    }
  }
  const initialForm = {
    name:
      contentCategories.find(
        (contentCategory) => contentCategory.id === selectedContentCategoryId,
      )?.name ?? "",
    feedIds: initialFeedIds,
  };
  const contentKey = `${selectedContentCategoryId ?? "closed"}:${initialForm.name}:${initialForm.feedIds.join(",")}`;

  return (
    <EditContentCategoryDialogContent
      key={contentKey}
      selectedContentCategoryId={selectedContentCategoryId}
      initialName={initialForm.name}
      initialFeedIds={initialForm.feedIds}
      onClose={onClose}
    />
  );
}
