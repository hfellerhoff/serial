"use client";

import { useLocation } from "@tanstack/react-router";
import clsx from "clsx";
import { RefreshCwIcon } from "lucide-react";
import { useCallback } from "react";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import {
  useFetchFeedItemsStatus,
  useFetchNewData,
  useProgressState,
} from "~/lib/data/store";
import { useShortcut } from "~/lib/hooks/useShortcut";

export function RefetchItemsButton() {
  const location = useLocation();
  const fetchNewData = useFetchNewData();
  const fetchStatus = useFetchFeedItemsStatus();
  const progressState = useProgressState();

  // Derive loading from the store so the spinner stays active until the
  // server's "new-data-complete" SSE event is processed, rather than when
  // the RPC promise resolves.
  const isRefreshing =
    fetchStatus === "fetching" && progressState.fetchType === "refresh";
  const isInitialLoading =
    fetchStatus === "fetching" && progressState.fetchType === "initial";
  const isDisabled = isRefreshing || isInitialLoading;

  const onClick = useCallback(async () => {
    if (isDisabled) return;
    await fetchNewData();
  }, [fetchNewData, isDisabled]);

  useShortcut("r", onClick);

  if (location.pathname !== "/") return null;

  return (
    <ButtonWithShortcut
      size="icon md:default"
      variant="outline"
      onClick={onClick}
      disabled={isDisabled}
      shortcut="r"
    >
      <RefreshCwIcon
        size={16}
        className={clsx({
          "animate-spin": isRefreshing,
        })}
      />
      <span className="hidden pl-1.5 md:block">Refresh</span>
    </ButtonWithShortcut>
  );
}
