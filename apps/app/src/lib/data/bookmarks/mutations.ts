"use client";

import {
  bookmarkMembershipChange,
  BookmarkMutationCoordinator,
  bookmarkPropertiesChange,
} from "@serial/bookmark-capture";
import { useMutation } from "@tanstack/react-query";
import { mixedContentStore } from "../mixed-content/store";
import { viewsStore } from "../views/store";
import { refreshNavigationSnapshotSafely } from "../navigation/store";
import { bookmarksStore } from "./store";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import { orpc } from "~/lib/orpc";

const mutationCoordinator =
  new BookmarkMutationCoordinator<ApplicationBookmark>();

function projectBookmark(
  bookmark: ApplicationBookmark,
  previousBookmark: ApplicationBookmark | undefined,
) {
  bookmarksStore.getState().upsert(bookmark);
  mixedContentStore.getState().reprojectUpsert({
    bookmark,
    previousBookmark,
    views: viewsStore.getState().views,
  });
}

function removeProjectedBookmark(bookmark: ApplicationBookmark) {
  bookmarksStore.getState().remove(bookmark.id);
  mixedContentStore.getState().reprojectDeletion({
    bookmarkId: bookmark.id,
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
        const changes = [
          ...(input.isSaved !== undefined
            ? [
                bookmarkPropertiesChange<ApplicationBookmark>(
                  "isSaved",
                  {
                    isSaved: input.isSaved,
                    savedUpdatedAt: now,
                    updatedAt: now,
                  },
                  ["isSaved", "savedUpdatedAt", "updatedAt"],
                ),
              ]
            : []),
          ...(input.isRead !== undefined
            ? [
                bookmarkPropertiesChange<ApplicationBookmark>(
                  "isRead",
                  {
                    isRead: input.isRead,
                    readUpdatedAt: now,
                    updatedAt: now,
                  },
                  ["isRead", "readUpdatedAt", "updatedAt"],
                ),
              ]
            : []),
          ...(input.progress !== undefined
            ? [
                bookmarkPropertiesChange<ApplicationBookmark>(
                  "progress",
                  {
                    progress: input.progress,
                    duration: input.duration ?? 0,
                    progressUpdatedAt: now,
                    updatedAt: now,
                  },
                  ["progress", "duration", "progressUpdatedAt", "updatedAt"],
                ),
              ]
            : []),
        ];
        const token = mutationCoordinator.begin(bookmarkId, changes);
        projectBookmark(
          mutationCoordinator.apply(previousBookmark, token),
          previousBookmark,
        );
        return { previousBookmark, token };
      },
      onSuccess: async (bookmark, input, context) => {
        const serverBookmark = bookmark as ApplicationBookmark;
        const currentBookmark = bookmarksStore
          .getState()
          .getBookmark(bookmarkId);
        const reconciled =
          context?.token && currentBookmark
            ? mutationCoordinator.reconcile(
                currentBookmark,
                serverBookmark,
                context.token,
              )
            : serverBookmark;
        projectBookmark(reconciled, currentBookmark);
        if (input.isSaved !== undefined || input.isRead !== undefined) {
          await refreshNavigationSnapshotSafely();
        }
      },
      onError: (_error, _input, context) => {
        const optimisticBookmark = bookmarksStore
          .getState()
          .getBookmark(bookmarkId);
        if (context?.previousBookmark && context.token && optimisticBookmark) {
          projectBookmark(
            mutationCoordinator.rollback(
              optimisticBookmark,
              context.previousBookmark,
              context.token,
            ),
            optimisticBookmark,
          );
        }
      },
    }),
  );
}

export function useSetBookmarkViewMutation() {
  return useMutation(
    orpc.bookmark.setView.mutationOptions({
      onMutate: (input) => {
        const previousBookmark = bookmarksStore
          .getState()
          .getBookmark(input.bookmarkId);
        if (!previousBookmark) return { previousBookmark };
        const token = mutationCoordinator.begin(input.bookmarkId, [
          bookmarkMembershipChange("view", input.viewId, input.assigned),
        ]);
        projectBookmark(
          mutationCoordinator.apply(previousBookmark, token),
          previousBookmark,
        );
        return { previousBookmark, token };
      },
      onSuccess: async (bookmark, _input, context) => {
        const currentBookmark = context?.previousBookmark
          ? bookmarksStore.getState().getBookmark(context.previousBookmark.id)
          : undefined;
        if (bookmark && currentBookmark && context?.token) {
          const applicationBookmark = mutationCoordinator.reconcile(
            currentBookmark,
            bookmark,
            context.token,
          );
          projectBookmark(applicationBookmark, currentBookmark);
        }
        await refreshNavigationSnapshotSafely();
      },
      onError: (_error, _input, context) => {
        if (!context?.previousBookmark || !context.token) return;
        const currentBookmark = bookmarksStore
          .getState()
          .getBookmark(context.previousBookmark.id);
        if (!currentBookmark) return;
        projectBookmark(
          mutationCoordinator.rollback(
            currentBookmark,
            context.previousBookmark,
            context.token,
          ),
          currentBookmark,
        );
      },
    }),
  );
}

export function useSetBookmarkTagMutation() {
  return useMutation(
    orpc.bookmark.setTag.mutationOptions({
      onMutate: (input) => {
        const previousBookmark = bookmarksStore
          .getState()
          .getBookmark(input.bookmarkId);
        if (!previousBookmark) return { previousBookmark };
        const token = mutationCoordinator.begin(input.bookmarkId, [
          bookmarkMembershipChange("tag", input.tagId, input.assigned),
        ]);
        projectBookmark(
          mutationCoordinator.apply(previousBookmark, token),
          previousBookmark,
        );
        return { previousBookmark, token };
      },
      onSuccess: async (bookmark, _input, context) => {
        const currentBookmark = context?.previousBookmark
          ? bookmarksStore.getState().getBookmark(context.previousBookmark.id)
          : undefined;
        if (bookmark && currentBookmark && context?.token) {
          const applicationBookmark = mutationCoordinator.reconcile(
            currentBookmark,
            bookmark,
            context.token,
          );
          projectBookmark(applicationBookmark, currentBookmark);
        }
        await refreshNavigationSnapshotSafely();
      },
      onError: (_error, _input, context) => {
        if (!context?.previousBookmark || !context.token) return;
        const currentBookmark = bookmarksStore
          .getState()
          .getBookmark(context.previousBookmark.id);
        if (!currentBookmark) return;
        projectBookmark(
          mutationCoordinator.rollback(
            currentBookmark,
            context.previousBookmark,
            context.token,
          ),
          currentBookmark,
        );
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
