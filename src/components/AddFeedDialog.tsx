"use client";
import { DialogTitle } from "@radix-ui/react-dialog";
import { ImportIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useDialogStore } from "~/app/(feed)/feed/dialogStore";
import { useContentCategories } from "~/lib/data/content-categories";
import { useCreateContentCategoryMutation } from "~/lib/data/content-categories/mutations";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { useFeeds } from "~/lib/data/feeds";
import {
  useCreateFeedMutation,
  useDeleteFeedMutation,
  useEditFeedMutation,
} from "~/lib/data/feeds/mutations";
import { validateFeedUrl } from "~/server/rss/validateFeedUrl";
import { ViewCategoriesInput } from "./AddViewDialog";
import { Button } from "./ui/button";
import { Combobox } from "./ui/combobox";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function AddFeedDialog() {
  const [feedUrl, setFeedUrl] = useState("");
  const [isAddingFeed, setIsAddingFeed] = useState(false);

  const { mutateAsync: createFeed } = useCreateFeedMutation();

  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);

  const dialog = useDialogStore((store) => store.dialog);
  const onDialogOpenChange = useDialogStore((store) => store.onOpenChange);

  const onOpenChange = (open: boolean = false) => {
    onDialogOpenChange(open);

    if (!open) {
      setFeedUrl("");
      setSelectedCategories([]);
    }
  };

  return (
    <Dialog open={dialog === "add-feed"} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-mono">Add Feed</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="url">Channel or RSS Feed URL</Label>
            <Input
              id="url"
              type="url"
              value={feedUrl}
              placeholder="https://www.youtube.com/@example"
              onChange={(e) => {
                setFeedUrl(e.target.value);
              }}
            />
          </div>
          <ViewCategoriesInput
            selectedCategories={selectedCategories}
            setSelectedCategories={setSelectedCategories}
          />
          <Button
            disabled={!validateFeedUrl(feedUrl) || isAddingFeed}
            onClick={async () => {
              setIsAddingFeed(true);

              try {
                const createFeedPromise = createFeed({
                  url: feedUrl,
                  categoryIds: selectedCategories,
                });
                toast.promise(createFeedPromise, {
                  loading: "Adding feed...",
                  success: () => {
                    return "Feed added!";
                  },
                  error: () => {
                    return "Something went wrong adding your feed.";
                  },
                });
                setFeedUrl("");
                onOpenChange(false);
              } catch {}

              setIsAddingFeed(false);
            }}
          >
            {isAddingFeed ? "Adding..." : "Add Feed"}
          </Button>
          <div className="py-4">
            <hr />
          </div>
          <Label>Have a lot of feeds to add?</Label>
          <Link href="/feed/import">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              <ImportIcon size={16} />
              <span className="pl-1.5">Bulk Import</span>
            </Button>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EditFeedDialog({
  selectedFeedId,
  onClose,
}: {
  selectedFeedId: null | number;
  onClose: () => void;
}) {
  const [isUpdatingFeed, setIsUpdatingFeed] = useState(false);
  const [isDeletingFeed, setIsDeletingFeed] = useState(false);

  const { mutateAsync: editFeed } = useEditFeedMutation();
  const { mutateAsync: deleteFeed } = useDeleteFeedMutation();

  const [name, setName] = useState<string>("");
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);

  const isFormDisabled = !name;

  const { feeds } = useFeeds();
  const { feedCategories } = useFeedCategories();

  useEffect(() => {
    if (!feeds || !selectedFeedId) return;

    const feed = feeds.find((v) => v.id === selectedFeedId);
    if (!feed) return;

    const _feedCategories = feedCategories
      .filter((category) => category.feedId === feed.id)
      .map((category) => category.categoryId)
      .filter((id) => typeof id === "number");

    setName(feed.name);
    setSelectedCategories(_feedCategories);
  }, [feedCategories, selectedFeedId, feeds]);

  return (
    <Dialog open={selectedFeedId !== null} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between font-mono">
            Edit Feed{" "}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              value={name}
              placeholder="My Feed"
              disabled
            />
          </div>
          <ViewCategoriesInput
            selectedCategories={selectedCategories}
            setSelectedCategories={setSelectedCategories}
          />
          <div className="flex gap-2">
            <Button
              disabled={isDeletingFeed}
              className="flex-1"
              variant="destructive"
              onClick={async () => {
                if (selectedFeedId === null) return;

                setIsDeletingFeed(true);
                try {
                  const deleteFeedPromise = deleteFeed(selectedFeedId);
                  toast.promise(deleteFeedPromise, {
                    loading: "Deleting feed...",
                    success: () => {
                      return "Feed deleted!";
                    },
                    error: () => {
                      return "Something went wrong deleting your feed.";
                    },
                  });
                  onClose();
                } catch {}

                setIsDeletingFeed(false);
              }}
            >
              {isDeletingFeed ? "Deleting..." : "Delete"}
            </Button>
            <Button
              disabled={isFormDisabled || isUpdatingFeed}
              onClick={async () => {
                if (selectedFeedId === null) return;

                setIsUpdatingFeed(true);
                try {
                  await editFeed({
                    feedId: selectedFeedId,
                    categoryIds: selectedCategories,
                  });
                  toast.success("Feed updated!");
                  onClose();
                } catch {}

                setIsUpdatingFeed(false);
              }}
              className="flex-1"
            >
              {isUpdatingFeed ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
