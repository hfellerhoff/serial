"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { ChipCombobox } from "./ui/chip-combobox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ControlledResponsiveDialog } from "./ui/responsive-dropdown";
import type { Ref } from "react";
import type { FeedCategorization } from "~/server/api/routers/contentCategoriesRouter";
import {
  useCreateContentCategoryMutation,
  useDeleteContentCategoryMutation,
  useUpdateContentCategoryMutation,
} from "~/lib/data/content-categories/mutations";
import { useContentCategories } from "~/lib/data/content-categories";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { useFeeds } from "~/lib/data/feeds";
import { useDialogStore } from "~/components/feed/dialogStore";

function CategoryFeedsInput({
  selectedFeedIds,
  setSelectedFeedIds,
}: {
  selectedFeedIds: number[];
  setSelectedFeedIds: (feedIds: number[]) => void;
}) {
  const { feeds } = useFeeds();
  const feedOptions = useMemo(
    () => feeds.map((f) => ({ id: f.id, label: f.name })),
    [feeds],
  );

  return (
    <ChipCombobox
      label="Feeds"
      placeholder="Search feeds..."
      options={feedOptions}
      selectedIds={selectedFeedIds}
      onAdd={(id) => setSelectedFeedIds([...selectedFeedIds, id])}
      onRemove={(id) =>
        setSelectedFeedIds(selectedFeedIds.filter((f) => f !== id))
      }
    />
  );
}

function CategoryNameInput({
  name,
  setName,
  inputRef,
}: {
  name: string;
  setName: (name: string) => void;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="name">Name</Label>
      <Input
        ref={inputRef}
        id="name"
        type="text"
        value={name}
        placeholder="My Tag"
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
    </div>
  );
}

export function AddContentCategoryDialog() {
  const [isAddingContentCategory, setIsAddingContentCategory] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const { mutateAsync: createContentCategory } =
    useCreateContentCategoryMutation();

  const [name, setName] = useState<string>("");
  const [selectedFeedIds, setSelectedFeedIds] = useState<number[]>([]);

  const dialog = useDialogStore((store) => store.dialog);
  const onOpenChangeDialog = useDialogStore((store) => store.onOpenChange);

  const isDisabled = !name;

  const onOpenChange = (value: boolean) => {
    onOpenChangeDialog(value);

    if (!value) {
      setName("");
      setSelectedFeedIds([]);
    }
  };

  return (
    <ControlledResponsiveDialog
      open={dialog === "add-content-category"}
      onOpenChange={onOpenChange}
      title="Add Tag"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        nameInputRef.current?.focus();
      }}
    >
      <div className="grid gap-6">
        <CategoryNameInput
          name={name}
          setName={setName}
          inputRef={nameInputRef}
        />
        <CategoryFeedsInput
          selectedFeedIds={selectedFeedIds}
          setSelectedFeedIds={setSelectedFeedIds}
        />
        <Button
          disabled={isDisabled}
          onClick={async () => {
            setIsAddingContentCategory(true);

            try {
              const addCategoryPromise = createContentCategory({
                name,
                feedCategorizations: selectedFeedIds.map((feedId) => ({
                  feedId,
                  selected: true,
                })),
              });
              toast.promise(addCategoryPromise, {
                loading: "Creating tag...",
                success: () => {
                  return "Tag created!";
                },
                error: () => {
                  return "Something went wrong creating your tag.";
                },
              });
              onOpenChange(false);
            } catch {
              // Error handled by toast.promise
            }

            setIsAddingContentCategory(false);
          }}
        >
          {isAddingContentCategory ? "Adding..." : "Add Tag"}
        </Button>
      </div>
    </ControlledResponsiveDialog>
  );
}

export function BulkAssignFeedsToTagsDialog({
  selectedTagIds,
  open,
  onOpenChange,
}: {
  selectedTagIds: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedFeedIds, setSelectedFeedIds] = useState<number[]>([]);

  const { mutateAsync: updateContentCategory } =
    useUpdateContentCategoryMutation();
  const { contentCategories } = useContentCategories();

  useEffect(() => {
    if (!open) setSelectedFeedIds([]);
  }, [open]);

  const handleSave = async () => {
    if (selectedTagIds.length === 0 || selectedFeedIds.length === 0) {
      onOpenChange(false);
      return;
    }

    setIsAssigning(true);
    const tagCount = selectedTagIds.length;

    const promises = selectedTagIds.map((tagId) => {
      const tag = contentCategories.find((c) => c.id === tagId);
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

    onOpenChange(false);
    setIsAssigning(false);
  };

  return (
    <ControlledResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Assign Feeds"
      description={`Assign feeds to ${selectedTagIds.length} tag${selectedTagIds.length > 1 ? "s" : ""}.`}
    >
      <div className="grid gap-6">
        <CategoryFeedsInput
          selectedFeedIds={selectedFeedIds}
          setSelectedFeedIds={setSelectedFeedIds}
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
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
  const [selectedFeedIds, setSelectedFeedIds] = useState<number[]>([]);
  const [initialFeedIds, setInitialFeedIds] = useState<number[]>([]);

  const isFormDisabled = !name;

  const { contentCategories } = useContentCategories();
  const { feedCategories } = useFeedCategories();

  useEffect(() => {
    if (!selectedContentCategoryId) return;

    const category = contentCategories.find(
      (v) => v.id === selectedContentCategoryId,
    );
    if (!category) return;

    setName(category.name);

    const assignedFeedIds = feedCategories
      .filter((fc) => fc.categoryId === selectedContentCategoryId)
      .map((fc) => fc.feedId);
    setInitialFeedIds(assignedFeedIds);
    setSelectedFeedIds(assignedFeedIds);
  }, [contentCategories, feedCategories, selectedContentCategoryId]);

  return (
    <ControlledResponsiveDialog
      open={selectedContentCategoryId !== null}
      onOpenChange={onClose}
      title="Edit Tag"
    >
      <div className="grid gap-6">
        <CategoryNameInput name={name} setName={setName} />
        <CategoryFeedsInput
          selectedFeedIds={selectedFeedIds}
          setSelectedFeedIds={setSelectedFeedIds}
        />
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
            onClick={async () => {
              if (selectedContentCategoryId === null) return;

              setIsUpdatingContentCategory(true);
              try {
                const added: FeedCategorization[] = selectedFeedIds
                  .filter((id) => !initialFeedIds.includes(id))
                  .map((feedId) => ({ feedId, selected: true }));
                const removed: FeedCategorization[] = initialFeedIds
                  .filter((id) => !selectedFeedIds.includes(id))
                  .map((feedId) => ({ feedId, selected: false }));

                const updateCategoryPromise = updateContentCategory({
                  name,
                  id: selectedContentCategoryId,
                  feedCategorizations: [...added, ...removed],
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
      </div>
    </ControlledResponsiveDialog>
  );
}
