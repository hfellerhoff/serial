import { z } from "zod";
import { eq } from "drizzle-orm";
import type { MixedContentScope } from "~/server/mixed-content/projection";
import { getClientChannel } from "~/server/api/channels";
import { INITIAL_ITEMS_PER_VIEW, ITEMS_PER_PAGE } from "~/server/api/constants";
import { publisher } from "~/server/api/publisher";
import { visibilityFilterSchema } from "~/lib/data/atoms";
import { INBOX_VIEW_ID } from "~/lib/data/views/constants";
import { views } from "~/server/db/schema";
import { protectedProcedure } from "~/server/orpc/base";
import { queryMixedContentPage } from "~/server/mixed-content/projection";
import { buildBookmarkDiff } from "~/server/mixed-content/sync";

const clientIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

const scopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("view"), viewId: z.number().int() }),
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

const manifestSchema = z.array(
  z.object({ id: z.string().min(1), version: z.string() }),
);

async function publishPage(input: {
  database: Parameters<typeof queryMixedContentPage>[0]["database"];
  userId: string;
  clientId: string;
  scope: MixedContentScope;
  visibility: "unread" | "read" | "later";
  cursor?: Parameters<typeof queryMixedContentPage>[0]["cursor"];
  limit: number;
}) {
  const page = await queryMixedContentPage(input);
  await publisher.publish(getClientChannel(input.userId, input.clientId), {
    source: "mixed",
    chunk: {
      type: "mixed-content-page",
      scope: input.scope,
      visibility: input.visibility,
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
      visibility: visibilityFilterSchema,
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
      visibility: input.visibility,
      cursor: input.cursor,
      limit: input.limit ?? ITEMS_PER_PAGE,
    });
    return { status: "completed" as const };
  });

export const synchronize = protectedProcedure
  .input(
    z.object({
      clientId: clientIdSchema,
      bookmarkManifest: manifestSchema.max(10_000).default([]),
    }),
  )
  .handler(async ({ context, input }) => {
    const userId = context.user.id;
    const clientChannel = getClientChannel(userId, input.clientId);
    const [bookmarkDiff, customViews] = await Promise.all([
      buildBookmarkDiff({
        database: context.db,
        userId,
        clientManifest: input.bookmarkManifest,
      }),
      context.db
        .select({ id: views.id })
        .from(views)
        .where(eq(views.userId, userId)),
    ]);
    await publisher.publish(clientChannel, {
      source: "bookmark",
      chunk: { type: "bookmark-diff", diff: bookmarkDiff },
    });

    const scopes: MixedContentScope[] = [
      { type: "view", viewId: INBOX_VIEW_ID },
      ...customViews.map(({ id }) => ({ type: "view" as const, viewId: id })),
    ];
    const visibilities = ["unread", "read", "later"] as const;
    await Promise.all(
      scopes.flatMap((scope) =>
        visibilities.map((visibility) =>
          publishPage({
            database: context.db,
            userId,
            clientId: input.clientId,
            scope,
            visibility,
            limit: INITIAL_ITEMS_PER_VIEW,
          }),
        ),
      ),
    );
    return { status: "completed" as const };
  });
