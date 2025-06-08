import { useParams, useRouter } from "next/navigation";
import { useFilteredFeedItemsOrder } from "~/lib/data/feed-items";
import { useShortcut } from "~/lib/hooks/useShortcut";

export function useVideoNavigationShortcuts() {
  const params = useParams();
  const router = useRouter();

  const filteredFeedItemsOrder = useFilteredFeedItemsOrder();

  const videoID = params.videoID as string;

  const currentItemIndex = filteredFeedItemsOrder?.indexOf(videoID);

  const goToPreviousVideo = () => {
    if (!filteredFeedItemsOrder?.length) return;

    if (!videoID || currentItemIndex <= 0) {
      void router.push("/feed");
      return;
    }

    const previousVideoId = filteredFeedItemsOrder[currentItemIndex - 1];

    if (!previousVideoId) {
      void router.push("/feed");
      return;
    }

    void router.push(`/feed/watch/${previousVideoId}`);
  };
  useShortcut("[", goToPreviousVideo);

  const goToNextVideo = () => {
    if (!filteredFeedItemsOrder?.length) return;

    if (
      !videoID ||
      currentItemIndex < 0 ||
      currentItemIndex >= filteredFeedItemsOrder.length - 1
    ) {
      void router.push("/feed");
      return;
    }

    const nextVideoId = filteredFeedItemsOrder[currentItemIndex + 1];

    if (!nextVideoId) {
      void router.push("/feed");
      return;
    }

    void router.push(`/feed/watch/${nextVideoId}`);
  };
  useShortcut("]", goToNextVideo);
}
