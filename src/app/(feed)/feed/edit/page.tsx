"use client";

import { TrashIcon } from "lucide-react";
import { AddFeedButton } from "~/components/AddFeedButton";
import { Button } from "~/components/ui/button";

import { useFeeds } from "~/lib/data/feeds";
import { FeedCategoryEditor } from "./FeedCategoryEditor";
import { ImportFeedButton } from "~/components/ImportFeedButton";
import { useContentCategories } from "~/lib/data/content-categories";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { useDeleteFeedMutation } from "~/lib/data/feeds/mutations";

export default function EditFeedsPage() {
  const { feeds } = useFeeds();
  const { contentCategories } = useContentCategories();
  const { feedCategories } = useFeedCategories();

  const { mutateAsync: deleteFeed } = useDeleteFeedMutation();

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-lg">Feeds</h2>
        <div className="flex items-center justify-end gap-2">
          <ImportFeedButton />
          <AddFeedButton />
        </div>
      </div>
      <div className="py-4">
        {feeds
          ?.toSorted((a, b) => {
            return a.name.localeCompare(b.name);
          })
          .map((feed, i) => (
            <div
              key={feed.url}
              className="border-muted/50 flex items-center justify-between border-0 border-t border-solid py-4"
            >
              <h3>{feed.name}</h3>
              <div
                key={feed.url}
                className="flex items-center justify-between gap-2"
              >
                <FeedCategoryEditor
                  feed={feed}
                  contentCategories={contentCategories}
                  feedCategories={feedCategories}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    void deleteFeed(feed.id);
                  }}
                >
                  <TrashIcon size={16} />
                </Button>
              </div>
            </div>
          ))}
      </div>
      {/* <div className="flex items-center justify-between pt-12">
        <h2 className="font-mono text-lg">Categories</h2>
        <AddFeedButton />
      </div>
      <div className="space-y-2 pt-4">
        {categories
          ?.toSorted((a, b) => {
            return a.name.localeCompare(b.name);
          })
          .map((category) => (
            <div
              key={category.id}
              className="flex items-center justify-between"
            >
              <h3>{category.name}</h3>
              <div className="flex items-center justify-between gap-2">
                <Button variant="outline" size="icon">
                  <EditIcon size={16} />
                </Button>
                <Button variant="outline" size="icon">
                  <TrashIcon size={16} />
                </Button>
              </div>
            </div>
          ))}
      </div> */}
    </div>
  );
}
