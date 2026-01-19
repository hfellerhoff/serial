"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AddContentCategoriesButton } from "./AddContentCategoryButton";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ControlledResponsiveDialog } from "./ui/responsive-dropdown";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import type React from "react";
import { VIEW_READ_STATUS } from "~/server/db/constants";
import {
  useCreateViewMutation,
  useDeleteViewMutation,
  useEditViewMutation,
} from "~/lib/data/views/mutations";
import { useViews } from "~/lib/data/views";
import { useContentCategories } from "~/lib/data/content-categories";
import { useDialogStore } from "~/components/feed/dialogStore";

function AddViewToggleItem({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return (
    <ToggleGroupItem size="sm" variant="outline" value={value}>
      {children}
    </ToggleGroupItem>
  );
}

function ViewNameInput({
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
        placeholder="My View"
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
    </div>
  );
}

function ViewTimeInput({
  daysWindow,
  setDaysWindow,
}: {
  daysWindow: number;
  setDaysWindow: (daysWindow: number) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="time-window">Time Window</Label>
      <ToggleGroup
        id="time-window"
        type="single"
        value={daysWindow.toString()}
        onValueChange={(value) => {
          if (!value) return;
          setDaysWindow(parseInt(value));
        }}
        size="sm"
        className="w-fit"
      >
        <AddViewToggleItem value="1">Today</AddViewToggleItem>
        <AddViewToggleItem value="7">This Week</AddViewToggleItem>
        <AddViewToggleItem value="30">This Month</AddViewToggleItem>
      </ToggleGroup>
    </div>
  );
}

// function ViewReadStatusInput({
//   readStatus,
//   setReadStatus,
// }: {
//   readStatus: number;
//   setReadStatus: (status: number) => void;
// }) {
//   return (
//     <div className="grid gap-2">
//       <Label htmlFor="name">Read Status</Label>
//       <ToggleGroup
//         type="single"
//         value={readStatus.toString()}
//         onValueChange={(value) => {
//           if (!value) return;
//           setReadStatus(parseInt(value));
//         }}
//         size="sm"
//         className="w-fit"
//       >
//         <AddViewToggleItem value={VIEW_READ_STATUS.UNREAD.toString()}>
//           Unread
//         </AddViewToggleItem>
//         <AddViewToggleItem value={VIEW_READ_STATUS.READ.toString()}>
//           Watched
//         </AddViewToggleItem>
//         <AddViewToggleItem value={VIEW_READ_STATUS.ANY.toString()}>
//           Any
//         </AddViewToggleItem>
//       </ToggleGroup>
//     </div>
//   );
// }

export function ViewCategoriesInput({
  selectedCategories,
  setSelectedCategories,
}: {
  selectedCategories: number[];
  setSelectedCategories: (categories: number[]) => void;
}) {
  const { contentCategories } = useContentCategories();

  if (contentCategories.length === 0) {
    return (
      <div className="grid gap-2">
        <Label htmlFor="categories">Categories</Label>
        <AddContentCategoriesButton />
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="categories">Categories</Label>
      <ToggleGroup
        id="categories"
        type="multiple"
        value={selectedCategories.map((category) => category.toString())}
        onValueChange={(value) => {
          setSelectedCategories(value.map((id) => parseInt(id)));
        }}
        size="sm"
        className="flex w-fit flex-wrap justify-start gap-1"
      >
        {contentCategories.map((category) => {
          return (
            <AddViewToggleItem key={category.id} value={category.id.toString()}>
              {category.name}
            </AddViewToggleItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}

export function AddViewDialog() {
  const [isAddingView, setIsAddingView] = useState(false);

  const { mutateAsync: createView } = useCreateViewMutation();

  const [name, setName] = useState<string>("");
  const [daysTimeWindow, setDaysTimeWindow] = useState<number>(1);
  const [readStatus, setReadStatus] = useState<number>(VIEW_READ_STATUS.UNREAD);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);

  const dialog = useDialogStore((store) => store.dialog);
  const onOpenChangeDialog = useDialogStore((store) => store.onOpenChange);

  const isDisabled = !name;

  const onOpenChange = (value: boolean) => {
    onOpenChangeDialog(value);

    if (!value) {
      setName("");
      setDaysTimeWindow(1);
      setReadStatus(VIEW_READ_STATUS.UNREAD);
      setSelectedCategories([]);
    }
  };

  return (
    <ControlledResponsiveDialog
      open={dialog === "add-view"}
      onOpenChange={onOpenChange}
      title="Add View"
    >
      <div className="grid gap-6">
        <ViewNameInput name={name} setName={setName} />
        <ViewTimeInput
          daysWindow={daysTimeWindow}
          setDaysWindow={setDaysTimeWindow}
        />
        {/* TODO: Implement read status */}
        {/* <ViewReadStatusInput
            readStatus={readStatus}
            setReadStatus={setReadStatus}
          /> */}
        <ViewCategoriesInput
          selectedCategories={selectedCategories}
          setSelectedCategories={setSelectedCategories}
        />
        <Button
          disabled={isDisabled}
          onClick={async () => {
            setIsAddingView(true);

            try {
              const addViewPromise = createView({
                name,
                daysWindow: daysTimeWindow,
                readStatus,
                categoryIds: selectedCategories,
              });
              toast.promise(addViewPromise, {
                loading: "Adding view...",
                success: () => {
                  return "View added!";
                },
                error: () => {
                  return "Something went wrong adding your view.";
                },
              });
              onOpenChange(false);
            } catch {
              // Error handled by toast.promise
            }

            setIsAddingView(false);
          }}
        >
          {isAddingView ? "Adding..." : "Add View"}
        </Button>
      </div>
    </ControlledResponsiveDialog>
  );
}

export function EditViewDialog({
  selectedViewId,
  onClose,
}: {
  selectedViewId: null | number;
  onClose: () => void;
}) {
  const [isUpdatingView, setIsUpdatingView] = useState(false);
  const [isDeletingView, setIsDeletingView] = useState(false);

  const { mutateAsync: editView } = useEditViewMutation();
  const { mutateAsync: deleteView } = useDeleteViewMutation();

  const [name, setName] = useState<string>("");
  const [daysTimeWindow, setDaysTimeWindow] = useState<number>(1);
  const [readStatus, setReadStatus] = useState<number>(VIEW_READ_STATUS.UNREAD);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);

  const isFormDisabled = !name;

  const { views } = useViews();
  useEffect(() => {
    if (!selectedViewId) return;

    const view = views.find((v) => v.id === selectedViewId);
    if (!view) return;

    setName(view.name);
    setDaysTimeWindow(view.daysWindow);
    setReadStatus(view.readStatus);
    setSelectedCategories(view.categoryIds);
  }, [views, selectedViewId]);

  return (
    <ControlledResponsiveDialog
      open={selectedViewId !== null}
      onOpenChange={onClose}
      title="Edit View"
    >
      <div className="grid gap-6">
        <ViewNameInput name={name} setName={setName} />
        <ViewTimeInput
          daysWindow={daysTimeWindow}
          setDaysWindow={setDaysTimeWindow}
        />
        {/* TODO: Implement read status */}
        {/* <ViewReadStatusInput
            readStatus={readStatus}
            setReadStatus={setReadStatus}
          /> */}
        <ViewCategoriesInput
          selectedCategories={selectedCategories}
          setSelectedCategories={setSelectedCategories}
        />
        <div className="flex gap-2">
          <Button
            disabled={isDeletingView}
            className="flex-1"
            variant="destructive"
            onClick={async () => {
              if (selectedViewId === null) return;

              setIsDeletingView(true);
              try {
                const deleteViewPromise = deleteView({
                  id: selectedViewId,
                });
                toast.promise(deleteViewPromise, {
                  loading: "Deleting view...",
                  success: () => {
                    return "View deleted!";
                  },
                  error: () => {
                    return "Something went wrong deleting your view.";
                  },
                });
                onClose();
              } catch {
                // Error handled by toast.promise
              }

              setIsDeletingView(false);
            }}
          >
            {isDeletingView ? "Deleting..." : "Delete"}
          </Button>
          <Button
            disabled={isFormDisabled || isUpdatingView}
            onClick={async () => {
              if (selectedViewId === null) return;

              setIsUpdatingView(true);
              try {
                const editViewPromise = editView({
                  name,
                  id: selectedViewId,
                  daysWindow: daysTimeWindow,
                  readStatus,
                  categoryIds: selectedCategories,
                });
                toast.promise(editViewPromise, {
                  loading: "Updating view...",
                  success: () => {
                    return "View updated!";
                  },
                  error: () => {
                    return "Something went wrong updating your view.";
                  },
                });
                onClose();
              } catch {
                // Error handled by toast.promise
              }

              setIsUpdatingView(false);
            }}
            className="flex-1"
          >
            {isUpdatingView ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </ControlledResponsiveDialog>
  );
}
