import { useState } from "react";
import type { useFeeds } from "~/lib/data/feeds";
import type { useFeedItemValue } from "~/lib/data/store";
import { useEditFeedMutation } from "~/lib/data/feeds/mutations";
import { useFeedCategories } from "~/lib/data/feed-categories/store";
import { useViewFeeds } from "~/lib/data/view-feeds/store";
import { detectTruncatedContent } from "~/lib/utils/detectTruncatedContent";
import {
  hasRespondedToTruncationAlert,
  setTruncationAlertResponded,
} from "~/lib/utils/truncationAlert";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";

type ReaderFeed = ReturnType<typeof useFeeds>["feeds"][number];
type ReaderFeedItem = ReturnType<typeof useFeedItemValue>;

export function useTruncationAlert({
  feed,
  feedItem,
  canMutate,
}: {
  feed: ReaderFeed | undefined;
  feedItem: ReaderFeedItem;
  canMutate: boolean;
}) {
  const feedCategories = useFeedCategories();
  const viewFeeds = useViewFeeds();
  const { mutate: editFeed } = useEditFeedMutation();

  const [alertDismissed, setAlertDismissed] = useState(false);

  const feedId = feed?.id;
  const platform = feed?.platform;
  const hasTruncationAlertResponse = feedId
    ? hasRespondedToTruncationAlert(feedId)
    : false;

  const shouldCheckTruncatedContent =
    !alertDismissed &&
    platform === "website" &&
    !!feedId &&
    !hasTruncationAlertResponse &&
    !!feedItem;
  const shouldShowTruncationAlert =
    shouldCheckTruncatedContent &&
    feedItem !== undefined &&
    detectTruncatedContent(feedItem.content, feedItem.contentSnippet);

  const handleAlertResponse = (openLocation: "serial" | "origin") => {
    if (!feedId || !canMutate) return;

    const categoryIds = feedCategories
      .filter((fc) => fc.feedId === feedId)
      .map((fc) => fc.categoryId);
    const viewIds = viewFeeds
      .filter((vf) => vf.feedId === feedId)
      .map((vf) => vf.viewId);

    editFeed({
      feedId,
      categoryIds,
      viewIds,
      openLocation,
      name: feed?.name ?? "",
    });

    setTruncationAlertResponded(feedId);
    setAlertDismissed(true);

    if (openLocation === "origin" && feedItem?.url) {
      window.open(feedItem.url, "_blank", "noopener,noreferrer");
    }
  };

  return { shouldShowTruncationAlert, handleAlertResponse };
}

export function TruncationAlert({
  canMutate,
  onRespond,
}: {
  canMutate: boolean;
  onRespond: (openLocation: "serial" | "origin") => void;
}) {
  return (
    <div className="w-full px-6">
      <Alert>
        <AlertTitle>Possible partial content detected</AlertTitle>
        <AlertDescription className="mt-2 text-base">
          It looks like this feed might not be providing all of its content in
          its feed. Would you like to open future items in the original website?
        </AlertDescription>
        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            disabled={!canMutate}
            onClick={() => onRespond("serial")}
          >
            No, view in reader
          </Button>
          <Button disabled={!canMutate} onClick={() => onRespond("origin")}>
            Yes, open in website
          </Button>
        </div>
      </Alert>
    </div>
  );
}
