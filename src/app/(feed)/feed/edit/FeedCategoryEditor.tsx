import {
  AlertTriangle,
  DeleteIcon,
  ListFilterPlusIcon,
  PlusIcon,
} from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Combobox } from "~/components/ui/combobox";
import {
  DatabaseContentCategory,
  DatabaseFeedCategory,
  DatabaseFeed,
} from "~/server/db/schema";
import { FeedCategoryCombobox } from "./FeedCategoryCombobox";
import {
  useAssignFeedCategoryMutation,
  useRemoveFeedCategoryMutation,
} from "~/lib/data/feedCategories";
import { Popover, PopoverContent } from "~/components/ui/popover";
import { PopoverTrigger } from "@radix-ui/react-popover";
import { useState } from "react";

export function FeedCategoryEditor({
  feed,
  feedCategories,
  contentCategories,
}: {
  feed: DatabaseFeed | undefined;
  contentCategories: DatabaseContentCategory[] | undefined;
  feedCategories: DatabaseFeedCategory[] | undefined;
}) {
  const [deletePopoverCategory, setDeletePopoverCategory] = useState(-1);

  const { mutate: assignFeedCategory, isPending: isAssignFeedCategoryPending } =
    useAssignFeedCategoryMutation();
  const {
    mutateAsync: removeFeedCategory,
    isPending: isRemoveFeedCategoryPending,
  } = useRemoveFeedCategoryMutation();

  const appliedContentCategories = feedCategories
    ?.filter((feedCategory) => feedCategory.feedId === feed?.id)
    .map((feedCategory) =>
      contentCategories?.find(
        (contentCategory) => contentCategory.id === feedCategory.categoryId,
      ),
    );
  const appliedContentCategoryIds = appliedContentCategories?.map(
    (category) => category?.id,
  );

  const dropdownOptions = contentCategories
    ?.filter(
      (contentCategory) =>
        !appliedContentCategoryIds?.includes(contentCategory.id),
    )
    .map((contentCategory) => ({
      value: contentCategory.name,
      label: contentCategory.name,
    }));

  if (!feed) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {appliedContentCategories?.map((category) => (
          <Popover
            key={category?.id}
            open={deletePopoverCategory === category?.id}
            onOpenChange={(open) => {
              if (open) {
                setDeletePopoverCategory(category?.id ?? -1);
              } else {
                setDeletePopoverCategory(-1);
              }
            }}
          >
            <PopoverTrigger>
              <Badge
                className="hover:bg-muted h-max"
                key={category?.id}
                variant="outline"
              >
                {category?.name}
              </Badge>
            </PopoverTrigger>
            <PopoverContent>
              <p className="text-sm">
                Would you like to remove the{" "}
                <span className="font-bold">{category?.name}</span> category
                from the feed <span className="font-bold">{feed.name}</span>?
              </p>
              <div className="flex items-center justify-between gap-2 pt-4">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setDeletePopoverCategory(-1);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={async () => {
                    if (!category?.id) return;
                    await removeFeedCategory({
                      feedId: feed.id,
                      categoryId: category?.id,
                    });
                    setDeletePopoverCategory(-1);
                  }}
                  disabled={isRemoveFeedCategoryPending}
                >
                  {isRemoveFeedCategoryPending ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ))}
      </div>
      <FeedCategoryCombobox
        onSelect={(categoryName) => {
          const categoryId = contentCategories?.find(
            (category) => category.name === categoryName,
          )?.id;

          if (typeof categoryId === "number" && categoryId >= 0) {
            assignFeedCategory({
              feedId: feed.id,
              categoryId,
            });
          }
        }}
        options={dropdownOptions}
        disabled={isAssignFeedCategoryPending}
      />
    </div>
  );
}
