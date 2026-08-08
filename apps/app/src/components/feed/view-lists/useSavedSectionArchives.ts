"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type {
  MixedContentCursor,
  MixedContentReference,
} from "~/server/mixed-content/projection";
import { uniqueReferences } from "~/lib/data/mixed-content/bookmarkProjection";
import { bookmarksStore } from "~/lib/data/bookmarks/store";
import { feedItemsStore } from "~/lib/data/store";
import { orpcRouterClient } from "~/lib/orpc";

export type SavedSectionArchiveState = {
  references: MixedContentReference[];
  cursor: MixedContentCursor;
  hasMore: boolean;
  isLoading: boolean;
};

const EMPTY_ARCHIVE_STATE: SavedSectionArchiveState = {
  references: [],
  cursor: null,
  hasMore: true,
  isLoading: false,
};

export function useSavedSectionArchives(viewId: number | undefined) {
  const [states, setStates] = useState<
    Record<string, SavedSectionArchiveState>
  >({});
  const [loadingSectionKeys] = useState(() => new Set<string>());

  const loadSection = useCallback(
    async (sectionKey: string, sectionPlacement: number | null) => {
      if (viewId === undefined) return;
      const current = states[sectionKey] ?? EMPTY_ARCHIVE_STATE;
      if (loadingSectionKeys.has(sectionKey) || !current.hasMore) {
        return;
      }

      loadingSectionKeys.add(sectionKey);
      setStates((currentStates) => ({
        ...currentStates,
        [sectionKey]: { ...current, isLoading: true },
      }));

      try {
        const page = await orpcRouterClient.mixedContent.getSavedSectionPage({
          scope: { type: "view", viewId },
          sectionPlacement,
          cursor: current.cursor,
        });
        feedItemsStore.getState().setFeedItems(page.feedItems);
        bookmarksStore.getState().upsertMany(page.bookmarks);

        setStates((currentStates) => ({
          ...currentStates,
          [sectionKey]: {
            references: uniqueReferences([
              ...(currentStates[sectionKey]?.references ?? []),
              ...page.references,
            ]),
            cursor: page.cursor,
            hasMore: page.hasMore,
            isLoading: false,
          },
        }));
      } catch (error) {
        setStates((currentStates) => ({
          ...currentStates,
          [sectionKey]: { ...current, isLoading: false },
        }));
        toast.error("Could not load archived Saved content");
        throw error;
      } finally {
        loadingSectionKeys.delete(sectionKey);
      }
    },
    [loadingSectionKeys, states, viewId],
  );

  return { states, loadSection };
}
