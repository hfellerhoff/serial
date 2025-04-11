"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useDialogStore } from "~/app/(feed)/feed/dialogStore";
import { useFeedItems, useFilteredFeedItemsOrder } from "~/lib/data/feed-items";
import {
  useFeedItemsSetWatchedValueMutation,
  useFeedItemsSetWatchLaterValueMutation,
} from "~/lib/data/feed-items/mutations";
import { useFeedItemsMap, useFeedItemsOrder } from "~/lib/data/atoms";

function doesAnyInputElementHaveFocus() {
  const elements = document.querySelectorAll("input, textarea, select, button");
  for (const element of elements) {
    if (element === document.activeElement) {
      return true;
    }
  }
  return false;
}

export type FeedContext = {
  view: "windowed" | "fullscreen";
  zoom: number;
  isCategoriesOpen: boolean;
  setIsCategoriesOpen: (value: boolean) => void;
};

const FeedContext = createContext<FeedContext | null>(null);

type KeyboardProviderProps = {
  children: React.ReactNode;
};

export function KeyboardProvider({ children }: KeyboardProviderProps) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();

  const [zoom, setZoom] = useState(2);

  const feedItemsOrder = useFeedItemsOrder();
  const feedItemsMap = useFeedItemsMap();
  const filteredFeedItemsOrder = useFilteredFeedItemsOrder();

  const { mutateAsync: setWatchedValue } = useFeedItemsSetWatchedValueMutation(
    params.videoID as string,
  );
  const { mutateAsync: setWatchLaterValue } =
    useFeedItemsSetWatchLaterValueMutation(params.videoID as string);

  // TODO: add this back
  // const { findPreviousVideoId, findNextVideoId } = useFeed();

  const [view, setView] = useState<FeedContext["view"]>("windowed");
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);

  const dialog = useDialogStore((store) => store.dialog);
  const launchDialog = useDialogStore((store) => store.launchDialog);
  const closeDialog = useDialogStore((store) => store.closeDialog);

  useEffect(() => {
    const processKey = (event: KeyboardEvent) => {
      const videoID = params.videoID as string;

      if (doesAnyInputElementHaveFocus()) return;

      const foundItem = feedItemsMap[videoID];
      const currentItemIndex = filteredFeedItemsOrder?.indexOf(videoID);

      switch (event.key) {
        case "`":
          setView((prev) => {
            return prev === "windowed" ? "fullscreen" : "windowed";
          });
          break;
        case "Escape":
          if (pathname === "/feed") break;
          router.push("/feed");
          break;
        case "[":
          if (!filteredFeedItemsOrder?.length || event.metaKey) return;

          if (!videoID || currentItemIndex <= 0) {
            void router.push("/feed");
            break;
          }

          const previousVideoId = filteredFeedItemsOrder[currentItemIndex - 1];

          if (!previousVideoId) {
            void router.push("/feed");
            break;
          }

          void router.push(`/feed/watch/${previousVideoId}`);
          break;
        case "]":
          if (!filteredFeedItemsOrder?.length || event.metaKey) return;

          if (
            !videoID ||
            currentItemIndex < 0 ||
            currentItemIndex >= filteredFeedItemsOrder.length - 1
          ) {
            void router.push("/feed");
            break;
          }

          const nextVideoId = filteredFeedItemsOrder[currentItemIndex + 1];

          if (!nextVideoId) {
            void router.push("/feed");
            break;
          }

          void router.push(`/feed/watch/${nextVideoId}`);
          break;
        case "a":
          event.preventDefault();

          if (dialog === "add-feed") {
            closeDialog();
            break;
          }

          launchDialog("add-feed");
          break;
        case "w":
          event.preventDefault();

          if (!foundItem?.feedId) return;

          void setWatchLaterValue({
            feedId: foundItem.feedId,
            contentId: foundItem.contentId,
            isWatchLater: !foundItem.isWatchLater,
          });
          break;
        case "e":
          event.preventDefault();

          if (!foundItem?.feedId) return;

          void setWatchedValue({
            feedId: foundItem.feedId,
            contentId: foundItem.contentId,
            isWatched: !foundItem.isWatched,
          });
          break;
        case "=":
          setZoom((z) => {
            if (z >= 5) {
              return z;
            }
            return z + 1;
          });
          break;
        case "-":
          setZoom((z) => {
            if (z <= 0) {
              return z;
            }
            return z - 1;
          });
          break;
      }
    };

    window.addEventListener("keydown", processKey);

    return () => {
      window.removeEventListener("keydown", processKey);
    };
  }, [
    closeDialog,
    dialog,
    feedItemsMap,
    launchDialog,
    params.videoID,
    router,
    setZoom,
    pathname,
  ]);

  return (
    <FeedContext.Provider
      value={{ view, zoom, isCategoriesOpen, setIsCategoriesOpen }}
    >
      {children}
    </FeedContext.Provider>
  );
}

export function useKeyboard() {
  const context = useContext(FeedContext);

  if (!context) {
    throw new Error("useKeyboard must be used within a KeyboardProvider");
  }

  return context;
}
