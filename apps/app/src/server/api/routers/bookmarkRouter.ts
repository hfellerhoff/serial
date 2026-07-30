import { z } from "zod";
import { protectedProcedure } from "~/server/orpc/base";
import {
  deleteBookmark,
  getBookmarkCapture,
  saveBookmarkFromApp,
  setBookmarkTag,
  setBookmarkView,
  updateBookmarkState,
} from "~/server/bookmarks/service";
import { normalizeBookmarkUrl } from "~/server/bookmarks/url";

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
  .handler(({ context, input }) =>
    saveBookmarkFromApp({
      database: context.db,
      userId: context.user.id,
      ...input,
    }),
  );

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
  .handler(({ context, input }) =>
    updateBookmarkState({
      database: context.db,
      userId: context.user.id,
      ...input,
    }),
  );

export const setView = protectedProcedure
  .input(
    z.object({
      bookmarkId: bookmarkIdSchema,
      viewId: z.number().int(),
      assigned: z.boolean(),
    }),
  )
  .handler(({ context, input }) =>
    setBookmarkView({
      database: context.db,
      userId: context.user.id,
      ...input,
    }),
  );

export const setTag = protectedProcedure
  .input(
    z.object({
      bookmarkId: bookmarkIdSchema,
      tagId: z.number().int(),
      assigned: z.boolean(),
    }),
  )
  .handler(({ context, input }) =>
    setBookmarkTag({
      database: context.db,
      userId: context.user.id,
      ...input,
    }),
  );

export const remove = protectedProcedure
  .input(z.object({ bookmarkId: bookmarkIdSchema }))
  .handler(({ context, input }) =>
    deleteBookmark({
      database: context.db,
      userId: context.user.id,
      ...input,
    }),
  );
