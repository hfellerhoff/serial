"use client";

import {
  createContext,
  Ref,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useDialogStore } from "~/app/(feed)/feed/dialogStore";
import { useFilteredFeedItemsOrder } from "~/lib/data/feed-items";
import {
  useFeedItemsSetWatchedValueMutation,
  useFeedItemsSetWatchLaterValueMutation,
} from "~/lib/data/feed-items/mutations";
import { useFeedItemsMap } from "~/lib/data/atoms";
import { useSidebar } from "./ui/sidebar";
import { doesAnyFormElementHaveFocus } from "~/lib/doesAnyFormElementHaveFocus";

export const MIN_ZOOM = 0;
export const MAX_ZOOM = 6;

export type FeedContext = {
  view: "windowed" | "fullscreen";
  toggleView: () => void;
  zoom: number;
  isCategoriesOpen: boolean;
  setIsCategoriesOpen: (value: boolean) => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

const FeedContext = createContext<FeedContext | null>(null);

type KeyboardProviderProps = {
  children: React.ReactNode;
};

export function KeyboardProvider({ children }: KeyboardProviderProps) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();

  const [zoom, setZoom] = useState(3);
  const { toggleSidebar } = useSidebar();

  const feedItemsMap = useFeedItemsMap();
  const filteredFeedItemsOrder = useFilteredFeedItemsOrder();

  const { mutateAsync: setWatchedValue } = useFeedItemsSetWatchedValueMutation(
    params.videoID as string,
  );
  const { mutateAsync: setWatchLaterValue } =
    useFeedItemsSetWatchLaterValueMutation(params.videoID as string);

  const [view, setView] = useState<FeedContext["view"]>("windowed");
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);

  const dialog = useDialogStore((store) => store.dialog);
  const launchDialog = useDialogStore((store) => store.launchDialog);
  const closeDialog = useDialogStore((store) => store.closeDialog);

  const zoomIn = useCallback(() => {
    setZoom((z) => {
      if (z >= MAX_ZOOM) {
        return z;
      }
      return z + 1;
    });
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => {
      if (z <= MIN_ZOOM) {
        return z;
      }
      return z - 1;
    });
  }, []);

  useEffect(() => {
    const processKey = (event: KeyboardEvent) => {
      const videoID = params.videoID as string;

      if (doesAnyFormElementHaveFocus()) return;
      if (event.metaKey || event.shiftKey || event.ctrlKey || event.altKey) {
        return;
      }

      const foundItem = feedItemsMap[videoID];
      const currentItemIndex = filteredFeedItemsOrder?.indexOf(videoID);

      if (event.key === "`" || event.key === "f") {
        setView((prev) => {
          return prev === "windowed" ? "fullscreen" : "windowed";
        });
        return;
      }
      if (event.key === "h") {
        if (pathname === "/feed") return;
        router.push("/feed");
        return;
      }
      if (event.key === "[") {
        if (!filteredFeedItemsOrder?.length || event.metaKey) return;

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
        return;
      }
      if (event.key === "]") {
        if (!filteredFeedItemsOrder?.length || event.metaKey) return;

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
        return;
      }
      if (event.key === "a") {
        event.preventDefault();

        if (dialog === "add-feed") {
          closeDialog();
          return;
        }

        launchDialog("add-feed");
        return;
      }
      if (event.key === "w") {
        event.preventDefault();

        if (!foundItem?.feedId) return;

        void setWatchLaterValue({
          feedId: foundItem.feedId,
          contentId: foundItem.contentId,
          isWatchLater: !foundItem.isWatchLater,
        });
        return;
      }
      if (event.key === "e") {
        event.preventDefault();

        if (!foundItem?.feedId) return;

        void setWatchedValue({
          feedId: foundItem.feedId,
          contentId: foundItem.contentId,
          isWatched: !foundItem.isWatched,
        });
        return;
      }
      if (event.key === "=") {
        zoomIn();
        return;
      }
      if (event.key === "-") {
        zoomOut();
        return;
      }
      if (event.key === "\\") {
        toggleSidebar("left");
        return;
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
    toggleSidebar,
    zoomIn,
    zoomOut,
  ]);

  const toggleView = useCallback(() => {
    setView((v) => (v === "fullscreen" ? "windowed" : "fullscreen"));
  }, []);

  return (
    <FeedContext.Provider
      value={{
        view,
        toggleView,
        zoom,
        isCategoriesOpen,
        setIsCategoriesOpen,
        zoomIn,
        zoomOut,
      }}
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
