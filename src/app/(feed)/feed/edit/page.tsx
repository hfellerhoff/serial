"use client";

import { TrashIcon } from "lucide-react";
import { AddFeedButton } from "~/components/AddFeedButton";
import { Button } from "~/components/ui/button";
import { useContentCategoriesQuery } from "~/lib/data/contentCategories";
import { useFeedCategoriesQuery } from "~/lib/data/feedCategories";
import { useDeleteFeedMutation, useFeedsQuery } from "~/lib/data/feeds";
import { FeedCategoryEditor } from "./FeedCategoryEditor";
import { ImportFeedButton } from "~/components/ImportFeedButton";

export default function EditFeedsPage() {
  const { data: feeds } = useFeedsQuery();
  const { data: contentCategories } = useContentCategoriesQuery();
  const { data: feedCategories } = useFeedCategoriesQuery();

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
