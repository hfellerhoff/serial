"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import clsx from "clsx";
import { RefreshCwIcon } from "lucide-react";
import { useCallback } from "react";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { useFetchFeedItems, useFetchFeedItemsStatus } from "~/lib/data/store";
import { useShortcut } from "~/lib/hooks/useShortcut";

export function RefetchItemsButton() {
  const location = useLocation();

  const queryClient = useQueryClient();

  const fetchStatus = useFetchFeedItemsStatus();
  const fetchFeedItems = useFetchFeedItems();

  const onClick = useCallback(() => {
    void fetchFeedItems();
    void queryClient.invalidateQueries();
  }, [fetchFeedItems, queryClient]);

  useShortcut("r", onClick);

  if (location.pathname !== "/") return null;

  const isLoading = fetchStatus === "fetching";

  return (
    <ButtonWithShortcut
      size="icon md:default"
      variant="outline"
      onClick={onClick}
      disabled={isLoading}
      shortcut="r"
    >
      <RefreshCwIcon
        size={16}
        className={clsx({
          "animate-spin": isLoading,
        })}
      />
      <span className="hidden pl-1.5 md:block">Refresh</span>
    </ButtonWithShortcut>
  );
}
