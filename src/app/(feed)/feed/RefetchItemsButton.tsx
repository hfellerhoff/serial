"use client";

import { RefreshCwIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { FETCH_NEW_FEED_ITEMS_KEY } from "~/lib/data/feed-items";
import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useFetchNewFeedItemsMutation } from "~/lib/data/feed-items/mutations";
import { useEffect } from "react";
import { useDialogStore } from "./dialogStore";
import { doesAnyFormElementHaveFocus } from "~/lib/doesAnyFormElementHaveFocus";

const ONE_HOUR = 1000 * 60 * 60;

export function RefetchItemsButton() {
  const pathname = usePathname();

  const { mutateAsync: fetchNewFeedItems, isPending } =
    useFetchNewFeedItemsMutation();

  useQuery({
    queryKey: [FETCH_NEW_FEED_ITEMS_KEY],
    queryFn: async () => {
      await fetchNewFeedItems();
      return true;
    },
    staleTime: ONE_HOUR,
  });

  const dialog = useDialogStore((store) => store.dialog);

  useEffect(() => {
    const processKey = (event: KeyboardEvent) => {
      if (doesAnyFormElementHaveFocus() || !!dialog) return;
      if (event.metaKey || event.shiftKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "r" && !isPending) {
        event.preventDefault();

        void fetchNewFeedItems();
        return;
      }
    };

    window.addEventListener("keydown", processKey);

    return () => {
      window.removeEventListener("keydown", processKey);
    };
  }, [isPending, fetchNewFeedItems, dialog]);

  if (pathname !== "/feed") return null;

  return (
    <Button
      size="icon md:default"
      variant="outline"
      onClick={async () => {
        await fetchNewFeedItems();
      }}
      disabled={isPending}
    >
      <RefreshCwIcon
        size={16}
        className={clsx({
          "animate-spin": isPending,
        })}
      />
      <span className="hidden pl-1.5 md:block">Refresh</span>
    </Button>
  );
}
