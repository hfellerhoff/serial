"use client";

import { useEffect } from "react";
import {
  clearRetainedEntityPins,
  setRetainedEntityPins,
} from "~/lib/data/page-retention";

export function useRetentionPin(
  entityKind: "feed-item" | "bookmark",
  entityId: string,
  reason: "reader" | "optimistic" = "reader",
) {
  useEffect(() => {
    const owner = `${reason}:${entityKind}:${entityId}`;
    setRetainedEntityPins(owner, {
      ...(entityKind === "feed-item"
        ? { feedItemIds: [entityId] }
        : { bookmarkIds: [entityId] }),
    });
    return () => clearRetainedEntityPins(owner);
  }, [entityId, entityKind, reason]);
}
