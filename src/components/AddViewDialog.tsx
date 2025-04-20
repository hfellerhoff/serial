"use client";
import { DialogTitle } from "@radix-ui/react-dialog";
import { ImportIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useDialogStore } from "~/app/(feed)/feed/dialogStore";
import { useContentCategories } from "~/lib/data/content-categories";
import { useCreateContentCategoryMutation } from "~/lib/data/content-categories/mutations";
import { useCreateFeedMutation } from "~/lib/data/feeds/mutations";
import { validateFeedUrl } from "~/server/rss/validateFeedUrl";
import { useTRPC } from "~/trpc/react";
import { Button } from "./ui/button";
import { Combobox } from "./ui/combobox";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import clsx from "clsx";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { VIEW_READ_STATUS } from "~/server/db/constants";
import { useCreateViewMutation } from "~/lib/data/views/mutations";

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

export function AddViewDialog() {
  const trpc = useTRPC();
  const [isAddingView, setIsAddingView] = useState(false);

  const { mutateAsync: createView } = useCreateViewMutation();

  const { contentCategories } = useContentCategories();

  const [name, setName] = useState<string>("");
  const [daysTimeWindow, setDaysTimeWindow] = useState<number>(1);
  const [readStatus, setReadStatus] = useState<number>(VIEW_READ_STATUS.UNREAD);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);

  const dialog = useDialogStore((store) => store.dialog);
  const onOpenChange = useDialogStore((store) => store.onOpenChange);

  const isDisabled = !name;

  return (
    <Dialog open={dialog === "add-view"} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-mono">Add View</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6">
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
          <div className="grid gap-2">
            <Label htmlFor="time-window">Time Window</Label>
            <ToggleGroup
              id="time-window"
              type="single"
              value={daysTimeWindow.toString()}
              onValueChange={(value) => {
                if (!value) return;
                setDaysTimeWindow(parseInt(value));
              }}
              size="sm"
              className="w-fit"
            >
              <AddViewToggleItem value="1">Today</AddViewToggleItem>
              <AddViewToggleItem value="7">This Week</AddViewToggleItem>
              <AddViewToggleItem value="30">This Month</AddViewToggleItem>
            </ToggleGroup>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="name">Read Status</Label>
            <ToggleGroup
              type="single"
              value={readStatus.toString()}
              onValueChange={(value) => {
                if (!value) return;
                setReadStatus(parseInt(value));
              }}
              size="sm"
              className="w-fit"
            >
              <AddViewToggleItem value={VIEW_READ_STATUS.UNREAD.toString()}>
                Unread
              </AddViewToggleItem>
              <AddViewToggleItem value={VIEW_READ_STATUS.READ.toString()}>
                Watched
              </AddViewToggleItem>
              <AddViewToggleItem value={VIEW_READ_STATUS.ANY.toString()}>
                Any
              </AddViewToggleItem>
            </ToggleGroup>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="categories">Categories</Label>
            <ToggleGroup
              id="categories"
              type="multiple"
              value={selectedCategories.map((category) => category.toString())}
              onValueChange={(value) => {
                if (!value) return;
                setSelectedCategories(value.map((id) => parseInt(id)));
              }}
              size="sm"
              className="flex w-fit flex-wrap justify-start gap-1"
            >
              {contentCategories.map((category) => {
                return (
                  <AddViewToggleItem
                    key={category.id}
                    value={category.id.toString()}
                  >
                    {category.name}
                  </AddViewToggleItem>
                );
              })}
            </ToggleGroup>
          </div>
          <Button
            disabled={isDisabled}
            onClick={async () => {
              setIsAddingView(true);

              try {
                await createView({
                  name,
                  daysWindow: daysTimeWindow,
                  readStatus,
                  categoryIds: selectedCategories,
                });
                toast.success("View added!");
              } catch {}

              setIsAddingView(false);
            }}
          >
            {isAddingView ? "Adding..." : "Add View"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
