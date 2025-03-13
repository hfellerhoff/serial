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
import { useCreateFeedMutation } from "~/lib/data/feeds";
import {
  useContentCategoriesQuery,
  useCreateContentCategoryMutation,
} from "~/lib/data/contentCategories";

export function AddFeedDialog() {
  const trpc = useTRPC();
  const [feedUrl, setFeedUrl] = useState("");
  const [isAddingFeed, setIsAddingFeed] = useState(false);

  const { mutateAsync: createFeed } = useCreateFeedMutation();

  const {
    data: categories,
    refetch: refetchCategories,
    isLoading: isLoadingCategories,
  } = useContentCategoriesQuery();
  const [categoryName, setCategoryName] = useState<string | null>(null);

  const addCategory = useCreateContentCategoryMutation();

  const categoryOptions = categories?.map((category) => ({
    value: category.name,
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
                  setCategoryName(newCategory.name);
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
                  await createFeed({ url: feedUrl });
                } else {
                  await createFeed({
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
