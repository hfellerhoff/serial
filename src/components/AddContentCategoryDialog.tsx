"use client";
import { DialogTitle } from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useDialogStore } from "~/app/(feed)/feed/dialogStore";
import { useContentCategories } from "~/lib/data/content-categories";
import {
  useCreateContentCategoryMutation,
  useDeleteContentCategoryMutation,
  useUpdateContentCategoryMutation,
} from "~/lib/data/content-categories/mutations";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

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

export function AddContentCategoryDialog() {
  const [isAddingContentCategory, setIsAddingContentCategory] = useState(false);

  const { mutateAsync: createContentCategory } =
    useCreateContentCategoryMutation();

  const [name, setName] = useState<string>("");

  const dialog = useDialogStore((store) => store.dialog);
  const onOpenChangeDialog = useDialogStore((store) => store.onOpenChange);

  const isDisabled = !name;

  const onOpenChange = (value: boolean) => {
    onOpenChangeDialog(value);

    if (!value) {
      setName("");
    }
  };

  return (
    <Dialog
      open={dialog === "add-content-category"}
      onOpenChange={onOpenChange}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-mono">Add Category</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6">
          <CategoryNameInput name={name} setName={setName} />
          <Button
            disabled={isDisabled}
            onClick={async () => {
              setIsAddingContentCategory(true);

              try {
                await createContentCategory({
                  name,
                });
                toast.success("Category added!");

                onOpenChange(false);
              } catch {}

              setIsAddingContentCategory(false);
            }}
          >
            {isAddingContentCategory ? "Adding..." : "Add Category"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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

  const isFormDisabled = !name;

  const { contentCategories } = useContentCategories();
  useEffect(() => {
    if (!contentCategories || !selectedContentCategoryId) return;

    const category = contentCategories.find(
      (v) => v.id === selectedContentCategoryId,
    );
    if (!category) return;

    setName(category.name);
  }, [contentCategories, selectedContentCategoryId]);

  return (
    <Dialog open={selectedContentCategoryId !== null} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between font-mono">
            Edit Category{" "}
          </DialogTitle>
        </DialogHeader>
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
                  await deleteContentCategory({
                    id: selectedContentCategoryId,
                  });
                  toast.success("Category deleted!");
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
                  await updateContentCategory({
                    name,
                    id: selectedContentCategoryId,
                  });
                  toast.success("Category updated!");
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
      </DialogContent>
    </Dialog>
  );
}
