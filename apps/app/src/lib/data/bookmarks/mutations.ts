"use client";

import {
  bookmarkMembershipChange,
  BookmarkMutationCoordinator,
  bookmarkPropertiesChange,
} from "@serial/bookmark-capture";
import { useMutation } from "@tanstack/react-query";
import { isBookmarkProjectionChange } from "../mixed-content/bookmarkProjection";
import { advanceMixedContentMembershipRevision } from "../mixed-content/membershipRevision";
import {
  hasBookmarkBodyOwner,
  mixedContentStore,
} from "../mixed-content/store";
import {
  clearRetainedEntityPins,
  setRetainedEntityPins,
} from "../page-retention";
import { viewsStore } from "../views/store";
import { shouldRetainBookmarkCapture } from "../offline-content";
import { bookmarksStore } from "./store";
import { bookmarkCapturesStore } from "./capture-store";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import { orpc, orpcRouterClient } from "~/lib/orpc";

const mutationCoordinator =
  new BookmarkMutationCoordinator<ApplicationBookmark>();

function optimisticRetentionOwner(token: {
  bookmarkId: string;
  sequence: number;
}) {
  return `optimistic:bookmark:${token.bookmarkId}:${token.sequence}`;
}

function retainOptimisticBookmark(token: {
  bookmarkId: string;
  sequence: number;
}) {
  setRetainedEntityPins(optimisticRetentionOwner(token), {
    bookmarkIds: [token.bookmarkId],
  });
}

function releaseOptimisticBookmark(token: {
  bookmarkId: string;
  sequence: number;
}) {
  clearRetainedEntityPins(optimisticRetentionOwner(token));
}

function projectBookmark(
  bookmark: ApplicationBookmark,
  previousBookmark: ApplicationBookmark | undefined,
) {
  if (isBookmarkProjectionChange(previousBookmark, bookmark)) {
    advanceMixedContentMembershipRevision();
  }
  bookmarksStore.getState().upsert(bookmark);
  mixedContentStore.getState().reprojectUpsert({
    bookmark,
    previousBookmark,
    views: viewsStore.getState().views,
  });
}

function removeProjectedBookmark(bookmark: ApplicationBookmark) {
  advanceMixedContentMembershipRevision();
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
          bookmarkCapturesStore.getState().remove(removedBookmarkId);
          const removedBookmark = bookmarksStore
            .getState()
            .getBookmark(removedBookmarkId);
          if (removedBookmark) removeProjectedBookmark(removedBookmark);
        }
        projectBookmark(bookmark, previousBookmark);
        if (
          shouldRetainBookmarkCapture(bookmark) &&
          bookmark.captureHash &&
          !bookmarkCapturesStore.getState().capturesDict[bookmark.id]
        ) {
          const captureResult = await orpcRouterClient.bookmark
            .getCapture({ bookmarkId: bookmark.id })
            .catch(() => null);
          if (captureResult?.status === "capture") {
            bookmarkCapturesStore.getState().upsert(captureResult.capture);
          }
        }
      },
    }),
  );
}

export function useUpdateBookmarkStateMutation(bookmarkId: string) {
  return useMutation(
    orpc.bookmark.updateState.mutationOptions({
      onMutate: (input) => {
        const changesMixedProjection =
          input.isSaved !== undefined || input.isRead !== undefined;
        const previousBookmark = bookmarksStore
          .getState()
          .getBookmark(bookmarkId);
        const previousCapture =
          bookmarkCapturesStore.getState().capturesDict[bookmarkId];
        if (!previousBookmark) {
          return { previousBookmark, previousCapture, changesMixedProjection };
        }
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
        retainOptimisticBookmark(token);
        try {
          projectBookmark(
            mutationCoordinator.apply(previousBookmark, token),
            previousBookmark,
          );
        } catch (error) {
          releaseOptimisticBookmark(token);
          throw error;
        }
        return {
          previousBookmark,
          previousCapture,
          token,
          changesMixedProjection,
        };
      },
      onSuccess: (bookmark, _input, context) => {
        try {
          const serverBookmark = bookmark as ApplicationBookmark;
          const currentBookmark = bookmarksStore
            .getState()
            .getBookmark(bookmarkId);
          if (!currentBookmark && !context?.changesMixedProjection) {
            if (hasBookmarkBodyOwner(bookmarkId)) {
              bookmarksStore.getState().upsert(serverBookmark);
            }
            return;
          }
          const reconciled =
            context?.token && currentBookmark
              ? mutationCoordinator.reconcile(
                  currentBookmark,
                  serverBookmark,
                  context.token,
                )
              : serverBookmark;
          projectBookmark(reconciled, currentBookmark);
        } finally {
          if (context?.token) releaseOptimisticBookmark(context.token);
        }
      },
      onError: (_error, _input, context) => {
        try {
          const optimisticBookmark = bookmarksStore
            .getState()
            .getBookmark(bookmarkId);
          if (
            context?.previousBookmark &&
            context.token &&
            optimisticBookmark
          ) {
            const rolledBackBookmark = mutationCoordinator.rollback(
              optimisticBookmark,
              context.previousBookmark,
              context.token,
            );
            projectBookmark(rolledBackBookmark, optimisticBookmark);
            if (
              context.previousCapture &&
              shouldRetainBookmarkCapture(rolledBackBookmark)
            ) {
              bookmarkCapturesStore.getState().upsert(context.previousCapture);
            }
          }
        } finally {
          if (context?.token) releaseOptimisticBookmark(context.token);
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
        retainOptimisticBookmark(token);
        try {
          projectBookmark(
            mutationCoordinator.apply(previousBookmark, token),
            previousBookmark,
          );
        } catch (error) {
          releaseOptimisticBookmark(token);
          throw error;
        }
        return { previousBookmark, token };
      },
      onSuccess: (bookmark, _input, context) => {
        try {
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
        } finally {
          if (context?.token) releaseOptimisticBookmark(context.token);
        }
      },
      onError: (_error, _input, context) => {
        try {
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
        } finally {
          if (context?.token) releaseOptimisticBookmark(context.token);
        }
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
        retainOptimisticBookmark(token);
        try {
          projectBookmark(
            mutationCoordinator.apply(previousBookmark, token),
            previousBookmark,
          );
        } catch (error) {
          releaseOptimisticBookmark(token);
          throw error;
        }
        return { previousBookmark, token };
      },
      onSuccess: (bookmark, _input, context) => {
        try {
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
        } finally {
          if (context?.token) releaseOptimisticBookmark(context.token);
        }
      },
      onError: (_error, _input, context) => {
        try {
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
        } finally {
          if (context?.token) releaseOptimisticBookmark(context.token);
        }
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
    }),
  );
}
