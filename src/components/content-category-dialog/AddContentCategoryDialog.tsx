"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { CategoryFeedsInput } from "./CategoryFeedsInput";
import { CategoryNameInput } from "./CategoryNameInput";
import { Button } from "~/components/ui/button";
import { ControlledResponsiveDialog } from "~/components/ui/responsive-dropdown";
import { useDialogStore } from "~/components/feed/dialogStore";
import { useCreateContentCategoryMutation } from "~/lib/data/content-categories/mutations";

export function AddContentCategoryDialog() {
  const [isAddingContentCategory, setIsAddingContentCategory] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const { mutateAsync: createContentCategory } =
    useCreateContentCategoryMutation();
  const [name, setName] = useState("");
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
          onClick={() => {
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
