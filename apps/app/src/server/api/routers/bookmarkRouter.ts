import { z } from "zod";
import { protectedProcedure } from "~/server/orpc/base";
import {
  deleteBookmark,
  getBookmarkCapture,
  saveBookmarkFromApp,
  setBookmarkTag,
  setBookmarkView,
  updateBookmarksReadState,
  updateBookmarkState,
} from "~/server/bookmarks/service";
import { normalizeBookmarkUrl } from "~/server/bookmarks/url";
import {
  publishBookmarkDeletion,
  publishBookmarkUpsert,
  publishBookmarkUpsertBatch,
} from "~/server/mixed-content/sync";
import { loadApplicationBookmarksById } from "~/server/mixed-content/projection";

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
    const result = await saveBookmarkFromApp({
      database: context.db,
      userId: context.user.id,
      ...input,
    });
    if (result.removedBookmarkId) {
      await publishBookmarkDeletion({
        userId: context.user.id,
        id: result.removedBookmarkId,
        canonicalUrl: result.bookmark.canonicalUrl,
      });
    }
    const applicationBookmark = await publishBookmarkUpsert({
      database: context.db,
      userId: context.user.id,
      bookmarkId: result.bookmark.id,
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
    const bookmark = await updateBookmarkState({
      database: context.db,
      userId: context.user.id,
      ...input,
    });
    const applicationBookmark = await publishBookmarkUpsert({
      database: context.db,
      userId: context.user.id,
      bookmarkId: bookmark.id,
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
    await setBookmarkView({
      database: context.db,
      userId: context.user.id,
      ...input,
    });
    return publishBookmarkUpsert({
      database: context.db,
      userId: context.user.id,
      bookmarkId: input.bookmarkId,
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
    await setBookmarkTag({
      database: context.db,
      userId: context.user.id,
      ...input,
    });
    return publishBookmarkUpsert({
      database: context.db,
      userId: context.user.id,
      bookmarkId: input.bookmarkId,
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
    });
    return updated;
  });

export const remove = protectedProcedure
  .input(z.object({ bookmarkId: bookmarkIdSchema }))
  .handler(async ({ context, input }) => {
    const deleted = await deleteBookmark({
      database: context.db,
      userId: context.user.id,
      ...input,
    });
    await publishBookmarkDeletion({
      userId: context.user.id,
      id: deleted.id,
      canonicalUrl: deleted.canonicalUrl,
    });
    return deleted;
  });
