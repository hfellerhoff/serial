import { z } from "zod";
import { ITEMS_PER_PAGE } from "~/server/api/constants";
import { contentStatusFilterSchema } from "~/lib/content-status";

export const MAX_RECONCILIATION_TARGETS = 16;
export const RECONCILIATION_REQUEST_BUDGET_BYTES = 128 * 1_024;

const reconciliationIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

const entityIdSchema = z.string().min(1).max(256);

const scopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("view"), viewId: z.number().int() }),
  z.object({ type: z.literal("feed"), feedId: z.number().int() }),
  z.object({ type: z.literal("tag"), tagId: z.number().int() }),
]);

const scopeTargetSchema = z.object({
  type: z.literal("scope"),
  scope: scopeSchema,
  contentStatus: contentStatusFilterSchema,
});

const entityManifestSchema = z
  .array(
    z.object({
      id: entityIdSchema,
      version: z.string().max(512),
    }),
  )
  .max(ITEMS_PER_PAGE);

const pageManifestSchema = z.object({
  feedItems: entityManifestSchema,
  bookmarks: entityManifestSchema,
});

const scopeInputSchema = z.object({
  target: scopeTargetSchema,
  pageManifest: pageManifestSchema,
  membershipRevision: z.number().int().nonnegative(),
});

const selectionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("cold"),
    contentStatus: contentStatusFilterSchema,
    membershipRevision: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("selected"),
    scope: scopeSchema,
    contentStatus: contentStatusFilterSchema,
    pageManifest: pageManifestSchema,
    membershipRevision: z.number().int().nonnegative(),
  }),
]);

const targetSchema = z.union([
  z.object({ target: z.object({ type: z.literal("organization") }) }),
  z.object({ target: z.object({ type: z.literal("navigation") }) }),
  scopeInputSchema,
]);

export const reconciliationInputSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("full"),
      reconciliationId: reconciliationIdSchema,
      selection: selectionSchema,
    }),
    z.object({
      type: z.literal("targeted"),
      reconciliationId: reconciliationIdSchema,
      targets: z.array(targetSchema).max(MAX_RECONCILIATION_TARGETS),
    }),
  ])
  .refine(
    (input) =>
      new TextEncoder().encode(JSON.stringify(input)).byteLength <=
      RECONCILIATION_REQUEST_BUDGET_BYTES,
    "Reconciliation request exceeds the request budget",
  );
