import { z } from "zod";
import { protectedProcedure } from "~/server/orpc/base";
import {
  deleteBookmark,
  getBookmarkCapture,
  getBookmarkCaptures,
  saveBookmarkFromApp,
  setBookmarkTag,
  setBookmarkView,
  updateBookmarksReadState,
  updateBookmarkState,
} from "~/server/bookmarks/service";
import { normalizeBookmarkUrl } from "~/server/bookmarks/url";
import {
  publishBookmarkConsolidationDeletions,
  publishBookmarkDeletion,
  publishBookmarkUpsert,
  publishBookmarkUpsertBatch,
} from "~/server/mixed-content/events";
import { loadApplicationBookmarksById } from "~/server/mixed-content/projection";
import { ALL_CONTENT_STATUS_KEYS } from "~/lib/reconciliation";

async function loadBookmarkBeforeMutation(input: {
  database: Parameters<typeof loadApplicationBookmarksById>[0]["database"];
  userId: string;
  bookmarkId: string;
}) {
  return (
    await loadApplicationBookmarksById({
      database: input.database,
      userId: input.userId,
      bookmarkIds: [input.bookmarkId],
    })
  )[0];
}

const bookmarkIdSchema = z.string().min(1);
const bookmarkUrlSchema = z.string().superRefine((value, context) => {
  try {
    normalizeBookmarkUrl(value);
  } catch {
    context.addIssue({
      code: "custom",
      message: "Enter an absolute HTTP(S) URL without credentials",
    });
  }
});

export const save = protectedProcedure
  .input(
    z.object({
      sourceUrl: bookmarkUrlSchema,
      bookmarkId: bookmarkIdSchema.optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const previousBookmark = input.bookmarkId
      ? await loadBookmarkBeforeMutation({
          database: context.db,
          userId: context.user.id,
          bookmarkId: input.bookmarkId,
        })
      : undefined;
    const result = await saveBookmarkFromApp({
      database: context.db,
      userId: context.user.id,
      ...input,
    });
    const removedBookmarkIds =
      result.removedBookmarkIds ??
      (result.removedBookmarkId ? [result.removedBookmarkId] : []);
    await publishBookmarkConsolidationDeletions({
      userId: context.user.id,
      bookmarkIds: removedBookmarkIds,
      canonicalUrl: result.bookmark.canonicalUrl,
    });
    const applicationBookmark = await publishBookmarkUpsert({
      database: context.db,
      userId: context.user.id,
      bookmarkId: result.bookmark.id,
      previousBookmark,
      contentStatusKeys: ALL_CONTENT_STATUS_KEYS,
    });
    return {
      ...result,
      bookmark: applicationBookmark ?? result.bookmark,
    };
  });

export const getCapture = protectedProcedure
  .input(
    z.object({
      bookmarkId: bookmarkIdSchema,
      contentHash: z.string().optional(),
    }),
  )
  .handler(({ context, input }) =>
    getBookmarkCapture({
      database: context.db,
      userId: context.user.id,
      ...input,
    }),
  );

export const getCaptures = protectedProcedure
  .input(
    z.object({
      bookmarkIds: z.array(bookmarkIdSchema).min(1).max(100),
    }),
  )
  .handler(({ context, input }) =>
    getBookmarkCaptures({
      database: context.db,
      userId: context.user.id,
      bookmarkIds: input.bookmarkIds,
    }),
  );

export const getById = protectedProcedure
  .input(z.object({ bookmarkId: bookmarkIdSchema }))
  .handler(async ({ context, input }) => {
    const bookmarks = await loadApplicationBookmarksById({
      database: context.db,
      userId: context.user.id,
      bookmarkIds: [input.bookmarkId],
    });
    return bookmarks[0] ?? null;
  });

export const updateState = protectedProcedure
  .input(
    z
      .object({
        bookmarkId: bookmarkIdSchema,
        isSaved: z.boolean().optional(),
        isRead: z.boolean().optional(),
        progress: z.number().int().min(0).optional(),
        duration: z.number().int().min(0).optional(),
      })
      .refine(
        (input) =>
          (input.progress === undefined) === (input.duration === undefined),
        { message: "Progress and duration must be updated together" },
      ),
  )
  .handler(async ({ context, input }) => {
    const previousBookmark = await loadBookmarkBeforeMutation({
      database: context.db,
      userId: context.user.id,
      bookmarkId: input.bookmarkId,
    });
    // The invalidation summary needs the state from immediately before the mutation.
    // react-doctor-disable-next-line react-doctor/server-sequential-independent-await
    const bookmark = await updateBookmarkState({
      database: context.db,
      userId: context.user.id,
      ...input,
    });
    const applicationBookmark = await publishBookmarkUpsert({
      database: context.db,
      userId: context.user.id,
      bookmarkId: bookmark.id,
      previousBookmark,
      affectsListProjection:
        input.isSaved !== undefined || input.isRead !== undefined,
    });
    return applicationBookmark ?? bookmark;
  });

export const setView = protectedProcedure
  .input(
    z.object({
      bookmarkId: bookmarkIdSchema,
      viewId: z.number().int(),
      assigned: z.boolean(),
    }),
  )
  .handler(async ({ context, input }) => {
    const previousBookmark = await loadBookmarkBeforeMutation({
      database: context.db,
      userId: context.user.id,
      bookmarkId: input.bookmarkId,
    });
    await setBookmarkView({
      database: context.db,
      userId: context.user.id,
      ...input,
    });
    return publishBookmarkUpsert({
      database: context.db,
      userId: context.user.id,
      bookmarkId: input.bookmarkId,
      previousBookmark,
    });
  });

export const setTag = protectedProcedure
  .input(
    z.object({
      bookmarkId: bookmarkIdSchema,
      tagId: z.number().int(),
      assigned: z.boolean(),
    }),
  )
  .handler(async ({ context, input }) => {
    const previousBookmark = await loadBookmarkBeforeMutation({
      database: context.db,
      userId: context.user.id,
      bookmarkId: input.bookmarkId,
    });
    await setBookmarkTag({
      database: context.db,
      userId: context.user.id,
      ...input,
    });
    return publishBookmarkUpsert({
      database: context.db,
      userId: context.user.id,
      bookmarkId: input.bookmarkId,
      previousBookmark,
    });
  });

export const setBulkReadValue = protectedProcedure
  .input(
    z.object({
      bookmarkIds: z.array(bookmarkIdSchema).max(500),
      isRead: z.boolean(),
    }),
  )
  .handler(async ({ context, input }) => {
    const previousBookmarks = await loadApplicationBookmarksById({
      database: context.db,
      userId: context.user.id,
      bookmarkIds: input.bookmarkIds,
    });
    // The invalidation summary needs the state from immediately before the mutation.
    // react-doctor-disable-next-line react-doctor/server-sequential-independent-await
    const updated = await updateBookmarksReadState({
      database: context.db,
      userId: context.user.id,
      ...input,
    });
    const applicationBookmarks = await loadApplicationBookmarksById({
      database: context.db,
      userId: context.user.id,
      bookmarkIds: updated.map(({ id }) => id),
    });
    await publishBookmarkUpsertBatch({
      userId: context.user.id,
      bookmarks: applicationBookmarks,
      previousBookmarks,
    });
    return updated;
  });

export const remove = protectedProcedure
  .input(z.object({ bookmarkId: bookmarkIdSchema }))
  .handler(async ({ context, input }) => {
    const bookmark = await loadBookmarkBeforeMutation({
      database: context.db,
      userId: context.user.id,
      bookmarkId: input.bookmarkId,
    });
    // The deletion summary needs the state from immediately before the mutation.
    // react-doctor-disable-next-line react-doctor/server-sequential-independent-await
    const deleted = await deleteBookmark({
      database: context.db,
      userId: context.user.id,
      ...input,
    });
    await publishBookmarkDeletion({
      userId: context.user.id,
      id: deleted.id,
      canonicalUrl: deleted.canonicalUrl,
      ...(bookmark ? { bookmark } : {}),
    });
    return deleted;
  });
