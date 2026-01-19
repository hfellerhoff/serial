import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFeedItemValue, useSetFeedItemValue } from "../store";
import { orpc } from "~/lib/orpc";

export function useInstapaperConnectionStatus() {
  return useQuery(orpc.instapaper.getConnectionStatus.queryOptions());
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
