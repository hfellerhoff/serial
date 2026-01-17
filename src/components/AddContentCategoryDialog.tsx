"use client";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { toast } from "sonner";
import { useContentCategories } from "~/lib/data/content-categories";
import {
  useCreateContentCategoryMutation,
  useDeleteContentCategoryMutation,
  useUpdateContentCategoryMutation,
} from "~/lib/data/content-categories/mutations";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { useFeeds } from "~/lib/data/feeds";
import type { FeedCategorization } from "~/server/api/routers/contentCategoriesRouter";
import type { DatabaseFeed } from "~/server/db/schema";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ControlledResponsiveDialog } from "./ui/responsive-dropdown";
import { ScrollArea } from "./ui/scroll-area";
import { useFeedItemsDict, useFeedItemsOrder } from "~/lib/data/store";
import { useDialogStore } from "~/components/feed/dialogStore";

function CategoryNameInput({
  name,
  setName,
}: {
  name: string;
  setName: (name: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="name">Name</Label>
      <Input
        id="name"
        type="text"
        value={name}
        placeholder="My Category"
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
    </div>
  );
}

function useMostRecentlyAppearingFeeds() {
  const { feeds } = useFeeds();
  const order = useFeedItemsOrder();
  const itemsDict = useFeedItemsDict();

  const feedIdsInOrder = order
    .map((id) => itemsDict[id]?.feedId)
    .filter(Boolean);
  const orderSet = new Set(feedIdsInOrder);

  const foundFeeds: DatabaseFeed[] = [];
  orderSet.forEach((entry) => {
    const foundFeed = feeds.find((feed) => feed.id === entry);
    if (foundFeed) {
      foundFeeds.push(foundFeed);
    }
  });

  return foundFeeds;
}

function CategoryFeedsInput({
  updatedFeedIdCategorizations,
  setUpdatedFeedIdCategorizations,
  categoryId,
}: {
  updatedFeedIdCategorizations: FeedCategorization[];
  setUpdatedFeedIdCategorizations: Dispatch<
    SetStateAction<FeedCategorization[]>
  >;
  categoryId: number | null;
}) {
  const { feedCategories } = useFeedCategories();
  const mostRecentlyAppearingFeeds = useMostRecentlyAppearingFeeds();

  if (mostRecentlyAppearingFeeds.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="name">Feeds</Label>
      <ScrollArea className="h-96 w-full">
        <ul>
          {mostRecentlyAppearingFeeds.map((feed) => {
            const updatedIsSelected = updatedFeedIdCategorizations.find(
              (categorization) => categorization.feedId === feed.id,
            )?.selected;
            const fallbackIsSelected = !!feedCategories.find(
              (category) =>
                category.categoryId === categoryId &&
                category.feedId === feed.id,
            );
            const isSelected = updatedIsSelected ?? fallbackIsSelected;

            return (
              <li key={feed.id} className="text-foreground flex w-full gap-2">
                <Checkbox
                  id={`category-for-${feed.id}`}
                  className="my-2"
                  checked={isSelected}
                  onCheckedChange={(value) => {
                    setUpdatedFeedIdCategorizations((categorizations) => {
                      const categorizationIndex = categorizations.findIndex(
                        (categorization) => categorization.feedId === feed.id,
                      );

                      const updatedCategorization: FeedCategorization = {
                        feedId: feed.id,
                        selected: Boolean(value),
                      };

                      if (categorizationIndex >= 0) {
                        categorizations[categorizationIndex] =
                          updatedCategorization;
                        return [...categorizations];
                      }

                      return [...categorizations, updatedCategorization];
                    });
                  }}
                />
                <Label
                  htmlFor={`category-for-${feed.id}`}
                  className="w-full py-2"
                >
                  {feed.name}
                </Label>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </div>
  );
}

export function AddContentCategoryDialog() {
  const [isAddingContentCategory, setIsAddingContentCategory] = useState(false);

  const { mutateAsync: createContentCategory } =
    useCreateContentCategoryMutation();

  const [name, setName] = useState<string>("");
  const [updatedFeedIdCategorizations, setUpdatedFeedIdCategorizations] =
    useState<FeedCategorization[]>([]);

  const dialog = useDialogStore((store) => store.dialog);
  const onOpenChangeDialog = useDialogStore((store) => store.onOpenChange);

  const isDisabled = !name;

  const onOpenChange = (value: boolean) => {
    onOpenChangeDialog(value);

    if (!value) {
      setName("");
      setUpdatedFeedIdCategorizations([]);
    }
  };

  return (
    <ControlledResponsiveDialog
      open={dialog === "add-content-category"}
      onOpenChange={onOpenChange}
      title="Add Category"
    >
      <div className="grid gap-6">
        <CategoryNameInput name={name} setName={setName} />
        <Button
          disabled={isDisabled}
          onClick={async () => {
            setIsAddingContentCategory(true);

            try {
              const addCategoryPromise = createContentCategory({
                name,
                feedCategorizations: updatedFeedIdCategorizations,
              });
              toast.promise(addCategoryPromise, {
                loading: "Creating category...",
                success: () => {
                  return "Category created!";
                },
                error: () => {
                  return "Something went wrong creating your category.";
                },
              });
              onOpenChange(false);
            } catch {}

            setIsAddingContentCategory(false);
          }}
        >
          {isAddingContentCategory ? "Adding..." : "Add Category"}
        </Button>
      </div>
    </ControlledResponsiveDialog>
  );
}

export function EditContentCategoryDialog({
  selectedContentCategoryId,
  onClose,
}: {
  selectedContentCategoryId: null | number;
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

  const [name, setName] = useState<string>("");
  const [updatedFeedIdCategorizations, setUpdatedFeedIdCategorizations] =
    useState<FeedCategorization[]>([]);

  const isFormDisabled = !name;

  const { contentCategories } = useContentCategories();
  useEffect(() => {
    if (!contentCategories || !selectedContentCategoryId) return;

    const category = contentCategories.find(
      (v) => v.id === selectedContentCategoryId,
    );
    if (!category) return;

    setName(category.name);
    setUpdatedFeedIdCategorizations([]);
  }, [contentCategories, selectedContentCategoryId]);

  return (
    <ControlledResponsiveDialog
      open={selectedContentCategoryId !== null}
      onOpenChange={onClose}
      title="Edit Category"
    >
      <div className="grid gap-6">
        <CategoryNameInput name={name} setName={setName} />
        <div className="flex gap-2">
          <Button
            disabled={isDeletingContentCategory}
            className="flex-1"
            variant="destructive"
            onClick={async () => {
              if (selectedContentCategoryId === null) return;

              setIsDeletingContentCategory(true);
              try {
                const deleteCategoryPromise = deleteContentCategory({
                  id: selectedContentCategoryId,
                });
                toast.promise(deleteCategoryPromise, {
                  loading: "Deleting category...",
                  success: () => {
                    return "Category deleted!";
                  },
                  error: () => {
                    return "Something went wrong deleting your category.";
                  },
                });
                onClose();
              } catch {}

              setIsDeletingContentCategory(false);
            }}
          >
            {isDeletingContentCategory ? "Deleting..." : "Delete"}
          </Button>
          <Button
            disabled={isFormDisabled || isUpdatingContentCategory}
            onClick={async () => {
              if (selectedContentCategoryId === null) return;

              setIsUpdatingContentCategory(true);
              try {
                const updateCategoryPromise = updateContentCategory({
                  name,
                  id: selectedContentCategoryId,
                  feedCategorizations: updatedFeedIdCategorizations,
                });
                toast.promise(updateCategoryPromise, {
                  loading: "Updating category...",
                  success: () => {
                    return "Category updated!";
                  },
                  error: () => {
                    return "Something went wrong updating your category.";
                  },
                });
                onClose();
              } catch {}

              setIsUpdatingContentCategory(false);
            }}
            className="flex-1"
          >
            {isUpdatingContentCategory ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </ControlledResponsiveDialog>
  );
}
