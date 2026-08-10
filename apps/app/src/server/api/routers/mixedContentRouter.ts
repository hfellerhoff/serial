import { z } from "zod";
import type { MixedContentScope } from "~/server/mixed-content/projection";
import type { ContentStatusFilter } from "~/lib/content-status";
import { getClientChannel } from "~/server/api/channels";
import { ITEMS_PER_PAGE } from "~/server/api/constants";
import { publisher } from "~/server/api/publisher";
import { contentStatusFilterSchema } from "~/lib/content-status";
import { protectedProcedure } from "~/server/orpc/base";
import {
  loadApplicationBookmarks,
  queryMixedContentPage,
} from "~/server/mixed-content/projection";
import {
  buildBookmarkSyncPages,
  computeChangedBookmarkSyncBuckets,
} from "~/server/mixed-content/sync";
import {
  BOOKMARK_SYNC_BUCKET_COUNT,
  BOOKMARK_SYNC_REQUEST_BUDGET_BYTES,
} from "~/lib/data/bookmarks/manifest";

const clientIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

const scopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("view"), viewId: z.number().int() }),
  z.object({ type: z.literal("feed"), feedId: z.number().int() }),
  z.object({ type: z.literal("tag"), tagId: z.number().int() }),
]);

const cursorSchema = z
  .object({
    sectionPlacement: z.number().nullable(),
    normalizedAt: z.coerce.date(),
    entityKind: z.enum(["bookmark", "feed-item"]),
    entityId: z.string(),
  })
  .nullable();

const manifestSchema = z
  .array(
    z.object({
      bucket: z
        .number()
        .int()
        .min(0)
        .max(BOOKMARK_SYNC_BUCKET_COUNT - 1),
      version: z.string().min(1).max(64),
    }),
  )
  .max(BOOKMARK_SYNC_BUCKET_COUNT)
  .refine(
    (manifest) =>
      new Set(manifest.map(({ bucket }) => bucket)).size === manifest.length,
    "Bookmark synchronization buckets must be unique",
  )
  .refine(
    (manifest) =>
      new TextEncoder().encode(JSON.stringify(manifest)).byteLength <=
      BOOKMARK_SYNC_REQUEST_BUDGET_BYTES,
    "Bookmark synchronization manifest exceeds the request budget",
  );

async function publishPage(input: {
  database: Parameters<typeof queryMixedContentPage>[0]["database"];
  userId: string;
  clientId: string;
  scope: MixedContentScope;
  contentStatus: ContentStatusFilter;
  cursor?: Parameters<typeof queryMixedContentPage>[0]["cursor"];
  limit: number;
}) {
  const page = await queryMixedContentPage(input);
  await publisher.publish(getClientChannel(input.userId, input.clientId), {
    source: "mixed",
    chunk: {
      type: "mixed-content-page",
      scope: input.scope,
      contentStatus: input.contentStatus,
      page,
      replacesScope: !input.cursor,
    },
  });
}

export const requestPage = protectedProcedure
  .input(
    z.object({
      clientId: clientIdSchema,
      scope: scopeSchema,
      contentStatus: contentStatusFilterSchema,
      cursor: cursorSchema.optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    await publishPage({
      database: context.db,
      userId: context.user.id,
      clientId: input.clientId,
      scope: input.scope,
      contentStatus: input.contentStatus,
      cursor: input.cursor,
      limit: input.limit ?? ITEMS_PER_PAGE,
    });
    return { status: "completed" as const };
  });

export const synchronize = protectedProcedure
  .input(
    z.object({
      clientId: clientIdSchema,
      bookmarkManifest: manifestSchema.default([]),
    }),
  )
  .handler(async ({ context, input }) => {
    const userId = context.user.id;
    const clientChannel = getClientChannel(userId, input.clientId);
    const serverBookmarks = await loadApplicationBookmarks({
      database: context.db,
      userId,
    });
    const changedBuckets = computeChangedBookmarkSyncBuckets(
      serverBookmarks,
      input.bookmarkManifest,
    );
    let publishedPages = 0;
    for (const bucket of changedBuckets) {
      const pages = buildBookmarkSyncPages(bucket);
      for (const chunk of pages) {
        // Publish sequentially so one synchronization cannot enqueue the whole
        // Bookmark library in the publisher's response buffer.
        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        await publisher.publish(clientChannel, {
          source: "bookmark",
          chunk,
        });
        publishedPages++;
      }
    }
    return {
      status: "completed" as const,
      changedBuckets: changedBuckets.length,
      publishedPages,
    };
  });
