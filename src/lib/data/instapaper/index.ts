import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFeedItemValue, useSetFeedItemValue } from "../store";
import { feedsStore } from "../feeds/store";
import { orpc } from "~/lib/orpc";

export function useInstapaperConnectionStatus() {
  return useQuery(orpc.instapaper.getConnectionStatus.queryOptions());
}

export function useShowInstapaperAction(itemId: string) {
  const { data: instapaperStatus } = useInstapaperConnectionStatus();
  const item = useFeedItemValue(itemId);
  const feedsDict = feedsStore.useFeedsDict();
  const feed = item ? feedsDict[item.feedId] : undefined;
  const shouldOpenInSerial =
    feed?.openLocation === "serial" || !feed?.openLocation;

  return (
    !!instapaperStatus?.isConfigured &&
    !!instapaperStatus.isConnected &&
    item?.platform === "website" &&
    shouldOpenInSerial
  );
}

export function useSaveToInstapaperMutation(contentId: string) {
  const feedItem = useFeedItemValue(contentId);
  const setFeedItem = useSetFeedItemValue(contentId);

  return useMutation(
    orpc.instapaper.saveBookmark.mutationOptions({
      onSuccess: () => {
        if (feedItem) {
          setFeedItem({ ...feedItem, isWatched: true });
        }
        toast.success("Saved to Instapaper");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to save to Instapaper");
      },
    }),
  );
}
