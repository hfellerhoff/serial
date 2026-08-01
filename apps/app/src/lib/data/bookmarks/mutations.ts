"use client";

import { useMutation } from "@tanstack/react-query";
import { feedItemsStore } from "../store";
import { mixedContentStore } from "../mixed-content/store";
import { viewsStore } from "../views/store";
import { refreshNavigationSnapshotSafely } from "../navigation/store";
import { bookmarksStore } from "./store";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import { orpc } from "~/lib/orpc";

function projectBookmark(
  bookmark: ApplicationBookmark,
  previousBookmark: ApplicationBookmark | undefined,
) {
  bookmarksStore.getState().upsert(bookmark);
  mixedContentStore.getState().reprojectUpsert({
    bookmark,
    previousBookmark,
    feedItems: feedItemsStore.getState().feedItemsDict,
    views: viewsStore.getState().views,
  });
}

function removeProjectedBookmark(bookmark: ApplicationBookmark) {
  bookmarksStore.getState().remove(bookmark.id);
  mixedContentStore.getState().reprojectDeletion({
    bookmarkId: bookmark.id,
    feedItems: feedItemsStore.getState().feedItemsDict,
  });
}

export function useSaveBookmarkMutation() {
  return useMutation(
    orpc.bookmark.save.mutationOptions({
      onSuccess: async (result) => {
        const bookmark = result.bookmark as ApplicationBookmark;
        const previousBookmark = bookmarksStore
          .getState()
          .getBookmark(bookmark.id);
        for (const removedBookmarkId of result.removedBookmarkIds ??
          (result.removedBookmarkId ? [result.removedBookmarkId] : [])) {
          const removedBookmark = bookmarksStore
            .getState()
            .getBookmark(removedBookmarkId);
          if (removedBookmark) removeProjectedBookmark(removedBookmark);
        }
        projectBookmark(bookmark, previousBookmark);
        await refreshNavigationSnapshotSafely();
      },
    }),
  );
}

export function useUpdateBookmarkStateMutation(bookmarkId: string) {
  return useMutation(
    orpc.bookmark.updateState.mutationOptions({
      onMutate: (input) => {
        const previousBookmark = bookmarksStore
          .getState()
          .getBookmark(bookmarkId);
        if (!previousBookmark) return { previousBookmark };
        const now = new Date();
        projectBookmark(
          {
            ...previousBookmark,
            ...(input.isSaved !== undefined
              ? { isSaved: input.isSaved, savedUpdatedAt: now }
              : {}),
            ...(input.isRead !== undefined
              ? { isRead: input.isRead, readUpdatedAt: now }
              : {}),
            ...(input.progress !== undefined
              ? {
                  progress: input.progress,
                  duration: input.duration ?? 0,
                  progressUpdatedAt: now,
                }
              : {}),
            updatedAt: now,
          },
          previousBookmark,
        );
        return { previousBookmark };
      },
      onSuccess: async (bookmark, input, context) => {
        projectBookmark(
          bookmark as ApplicationBookmark,
          context?.previousBookmark,
        );
        if (input.isSaved !== undefined || input.isRead !== undefined) {
          await refreshNavigationSnapshotSafely();
        }
      },
      onError: (_error, _input, context) => {
        const optimisticBookmark = bookmarksStore
          .getState()
          .getBookmark(bookmarkId);
        if (context?.previousBookmark) {
          projectBookmark(context.previousBookmark, optimisticBookmark);
        }
      },
    }),
  );
}

export function useSetBookmarkViewMutation() {
  return useMutation(
    orpc.bookmark.setView.mutationOptions({
      onSuccess: async (bookmark) => {
        if (!bookmark) return;
        const applicationBookmark = bookmark;
        projectBookmark(
          applicationBookmark,
          bookmarksStore.getState().getBookmark(applicationBookmark.id),
        );
        await refreshNavigationSnapshotSafely();
      },
    }),
  );
}

export function useSetBookmarkTagMutation() {
  return useMutation(
    orpc.bookmark.setTag.mutationOptions({
      onSuccess: async (bookmark) => {
        if (!bookmark) return;
        const applicationBookmark = bookmark;
        projectBookmark(
          applicationBookmark,
          bookmarksStore.getState().getBookmark(applicationBookmark.id),
        );
        await refreshNavigationSnapshotSafely();
      },
    }),
  );
}

export function useDeleteBookmarkMutation() {
  return useMutation(
    orpc.bookmark.remove.mutationOptions({
      onMutate: ({ bookmarkId }) => {
        const previousBookmark = bookmarksStore
          .getState()
          .getBookmark(bookmarkId);
        if (previousBookmark) removeProjectedBookmark(previousBookmark);
        return { previousBookmark };
      },
      onError: (_error, _input, context) => {
        if (context?.previousBookmark) {
          projectBookmark(context.previousBookmark, undefined);
        }
      },
      onSuccess: async () => {
        await refreshNavigationSnapshotSafely();
      },
    }),
  );
}
