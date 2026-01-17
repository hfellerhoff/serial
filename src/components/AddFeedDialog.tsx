import { ToggleGroup } from "@radix-ui/react-toggle-group";
import { ImportIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { useFeeds } from "~/lib/data/feeds";
import {
  useCreateFeedMutation,
  useDeleteFeedMutation,
  useEditFeedMutation,
} from "~/lib/data/feeds/mutations";
import { PLATFORM_TO_FORMATTED_NAME_MAP } from "~/lib/data/feeds/utils";
import { useShortcut } from "~/lib/hooks/useShortcut";
import type { FeedOpenLocation, FeedPlatform } from "~/server/db/schema";
import { getAssumedFeedPlatform } from "~/server/rss/validateFeedUrl";
import { ViewCategoriesInput } from "./AddViewDialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ControlledResponsiveDialog } from "./ui/responsive-dropdown";
import { ToggleGroupItem } from "./ui/toggle-group";
import { useDialogStore } from "~/components/feed/dialogStore";
import { Link } from "@tanstack/react-router";

export function AddFeedDialog() {
  const [feedUrl, setFeedUrl] = useState("");
  const [isAddingFeed, setIsAddingFeed] = useState(false);

  const { mutateAsync: createFeed } = useCreateFeedMutation();

  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);

  const dialog = useDialogStore((store) => store.dialog);
  const onDialogOpenChange = useDialogStore((store) => store.onOpenChange);

  const launchDialog = useDialogStore((store) => store.launchDialog);
  useShortcut("a", (event) => {
    event.preventDefault();
    launchDialog("add-feed");
  });

  const onOpenChange = (open = false) => {
    onDialogOpenChange(open);

    if (!open) {
      setFeedUrl("");
      setSelectedCategories([]);
    }
  };

  const feedPlatform = getAssumedFeedPlatform(feedUrl);

  return (
    <ControlledResponsiveDialog
      open={dialog === "add-feed"}
      onOpenChange={onOpenChange}
      title="Add Feed"
    >
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
          disabled={isAddingFeed}
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
          Add {PLATFORM_TO_FORMATTED_NAME_MAP[feedPlatform]} Feed
        </Button>
        <div className="py-4">
          <hr />
        </div>
        <Label>Have a lot of feeds to add?</Label>
        <Link to="/import">
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
    </ControlledResponsiveDialog>
  );
}

export function FeedOpenLocationToggleGroup({
  feedPlatform,
  openLocation,
  setOpenLocation,
}: {
  feedPlatform: FeedPlatform;
  openLocation: FeedOpenLocation;
  setOpenLocation: (location: FeedOpenLocation) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="categories">Open items in</Label>
      <ToggleGroup
        id="categories"
        type="single"
        value={openLocation}
        onValueChange={(value) => {
          if (!value) return;
          setOpenLocation(value as FeedOpenLocation);
        }}
        className="flex w-fit flex-wrap justify-start gap-1"
      >
        <ToggleGroupItem size="sm" variant="outline" value="serial">
          Serial
        </ToggleGroupItem>
        <ToggleGroupItem size="sm" variant="outline" value="origin">
          {PLATFORM_TO_FORMATTED_NAME_MAP[feedPlatform]}
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
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
  const [selectedOpenLocation, setSelectedOpenLocation] =
    useState<FeedOpenLocation>("serial");

  const isFormDisabled = !name;

  const { feeds } = useFeeds();
  const { feedCategories } = useFeedCategories();

  useEffect(() => {
    if (!feeds || selectedFeedId == null) return;

    const feed = feeds.find((v) => v.id === selectedFeedId);
    if (!feed) return;

    const _feedCategories = feedCategories
      .filter((category) => category.feedId === feed.id)
      .map((category) => category.categoryId)
      .filter((id) => typeof id === "number");

    setName(feed.name);
    setSelectedCategories(_feedCategories);
    setSelectedOpenLocation(feed.openLocation);
  }, [feedCategories, selectedFeedId, feeds]);

  const feed = feeds.find((v) => v.id === selectedFeedId);

  return (
    <ControlledResponsiveDialog
      open={selectedFeedId !== null}
      onOpenChange={onClose}
      title="Edit Feed"
    >
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
        <FeedOpenLocationToggleGroup
          feedPlatform={feed?.platform ?? "youtube"}
          openLocation={selectedOpenLocation}
          setOpenLocation={setSelectedOpenLocation}
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
                  openLocation: selectedOpenLocation,
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
    </ControlledResponsiveDialog>
  );
}
