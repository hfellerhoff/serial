"use client";
import { DialogTitle } from "@radix-ui/react-dialog";
import { useState } from "react";
import { useDialogStore } from "~/app/(feed)/feed/dialogStore";
import { useTRPC } from "~/trpc/react";
import { Button } from "./ui/button";
import { Combobox } from "./ui/combobox";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { validateFeedUrl } from "~/server/rss/validateFeedUrl";
import { toast } from "sonner";
import { useFeed } from "~/lib/data/FeedProvider";

import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";

export function AddFeedDialog() {
  const trpc = useTRPC();
  const [feedUrl, setFeedUrl] = useState("");
  const { addFeed } = useFeed();
  const [isAddingFeed, setIsAddingFeed] = useState(false);

  const {
    data: categories,
    refetch: refetchCategories,
    isLoading: isLoadingCategories,
  } = useQuery(trpc.contentCategories.getAllForUser.queryOptions());
  const [categoryName, setCategoryName] = useState<string | null>(null);

  const addCategory = useMutation(
    trpc.contentCategories.create.mutationOptions(),
  );

  const categoryOptions = categories?.map((category) => ({
    value: category.name.toLowerCase(),
    label: category.name,
  }));

  const dialog = useDialogStore((store) => store.dialog);
  const onOpenChange = useDialogStore((store) => store.onOpenChange);

  return (
    <Dialog open={dialog === "add-feed"} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-mono">Add Feed</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
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
          {addCategory.isPending || isLoadingCategories ? (
            <Button disabled variant="outline">
              Loading...
            </Button>
          ) : (
            <Combobox
              label="Category"
              options={categoryOptions ?? []}
              onSelect={setCategoryName}
              onAddOption={async (newOption) => {
                await addCategory.mutateAsync({ name: newOption });
                const categoriesResponse = await refetchCategories();
                const newCategory = categoriesResponse.data?.find(
                  (category) => category.name === newOption,
                );

                if (newCategory) {
                  setCategoryName(newCategory.name.toLowerCase());
                }
              }}
              value={categoryName}
              placeholder="Select a category"
              width="full"
            />
          )}
          <Button
            disabled={!validateFeedUrl(feedUrl) || isAddingFeed}
            onClick={async () => {
              const category = !!categoryName
                ? categories?.find((category) => category.name === categoryName)
                : undefined;

              setIsAddingFeed(true);

              try {
                if (!category) {
                  await addFeed({ url: feedUrl });
                } else {
                  await addFeed({
                    url: feedUrl,
                    categoryId: category.id,
                  });
                }
                toast.success("Feed added!");
                setFeedUrl("");
              } catch {}

              setIsAddingFeed(false);
            }}
          >
            {isAddingFeed ? "Adding..." : "Add Feed"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
