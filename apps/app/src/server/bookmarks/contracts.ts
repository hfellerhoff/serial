import { z } from "zod";
import { BOOKMARK_CAPTURE_LIMITS } from "@serial/bookmark-capture";
import type {
  BookmarkClassification,
  BookmarkPreview,
} from "~/lib/content/classification";
import { CONTENT_CLASSIFIER_VERSION } from "~/lib/content/classification";
import {
  contentPlatformSchema,
  contentTypeSchema,
  videoOrientationSchema,
} from "~/lib/content/descriptor";

export {
  BOOKMARK_CAPTURE_LIMITS,
  EXTENSION_BOOKMARK_CONTRACT_VERSION,
  READABILITY_EXTRACTOR_VERSION,
  SANITIZER_POLICY_VERSION,
} from "@serial/bookmark-capture";

const captureFailureReasonSchema = z.enum([
  "blocked_target",
  "timeout",
  "http_error",
  "not_html",
  "too_large",
  "unextractable",
  "invalid_capture",
  "unsupported_capture_version",
  "rate_limited",
  "capacity_limited",
  "unsupported_content",
]);

export type CaptureFailureReason = z.infer<typeof captureFailureReasonSchema>;

export type BookmarkCaptureOutcome =
  | { status: "captured" }
  | { status: "preserved"; reason: CaptureFailureReason }
  | { status: "unavailable"; reason: CaptureFailureReason };

export type BookmarkSaveResult<TBookmark> = {
  disposition: "created" | "refreshed" | "consolidated";
  bookmark: TBookmark;
  capture: BookmarkCaptureOutcome;
  removedBookmarkId?: string;
  removedBookmarkIds?: string[];
};

const boundedString = (maxCodePoints: number) =>
  z.string().refine((value) => [...value].length <= maxCodePoints);

const boundedUrlString = z
  .string()
  .min(1)
  .refine(
    (value) =>
      Buffer.byteLength(value, "utf8") <= BOOKMARK_CAPTURE_LIMITS.urlBytes,
  );

function optionalBoundedString(value: unknown, maxCodePoints: number) {
  return typeof value === "string" && [...value].length <= maxCodePoints
    ? value
    : undefined;
}

function optionalBoundedUrlString(value: unknown) {
  return typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value, "utf8") <= BOOKMARK_CAPTURE_LIMITS.urlBytes
    ? value
    : undefined;
}

const versionString = z
  .string()
  .regex(/^[\x20-\x7e]+$/)
  .refine(
    (value) =>
      Buffer.byteLength(value, "ascii") <= BOOKMARK_CAPTURE_LIMITS.versionBytes,
  );

const extensionDiscoveredFeedSchema = z.strictObject({
  url: boundedUrlString.refine((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }),
  title: boundedString(BOOKMARK_CAPTURE_LIMITS.titleCodePoints).optional(),
});

export const extensionDiscoveredFeedsSchema = z
  .array(extensionDiscoveredFeedSchema)
  .max(BOOKMARK_CAPTURE_LIMITS.discoveredFeeds);

export const extensionCaptureCandidateSchema = z
  .strictObject({
    effectiveUrl: boundedUrlString,
    canonicalUrl: z.unknown().transform(optionalBoundedUrlString).optional(),
    title: boundedString(BOOKMARK_CAPTURE_LIMITS.titleCodePoints),
    description: z
      .unknown()
      .transform((value) =>
        optionalBoundedString(
          value,
          BOOKMARK_CAPTURE_LIMITS.descriptionCodePoints,
        ),
      )
      .optional(),
    author: z
      .unknown()
      .transform((value) =>
        optionalBoundedString(value, BOOKMARK_CAPTURE_LIMITS.authorCodePoints),
      )
      .optional(),
    publishedAt: z
      .unknown()
      .transform((value) =>
        typeof value === "string" &&
        z.iso.datetime({ offset: true }).safeParse(value).success
          ? value
          : undefined,
      )
      .optional(),
    siteName: z
      .unknown()
      .transform((value) =>
        optionalBoundedString(
          value,
          BOOKMARK_CAPTURE_LIMITS.siteNameCodePoints,
        ),
      )
      .optional(),
    iconUrl: z.unknown().transform(optionalBoundedUrlString).optional(),
    thumbnailUrl: z.unknown().transform(optionalBoundedUrlString).optional(),
    descriptor: z.strictObject({
      platform: contentPlatformSchema,
      contentType: contentTypeSchema,
      orientation: videoOrientationSchema.nullable(),
      contentId: z.string().min(1).nullable(),
      classifierVersion: z.literal(CONTENT_CLASSIFIER_VERSION),
    }),
    contentHtml: z.string().min(1).optional(),
    extractorVersion: versionString.optional(),
    sanitizerPolicyVersion: z.number().int().positive().optional(),
  })
  .superRefine((candidate, context) => {
    const captureFields = [
      candidate.contentHtml,
      candidate.extractorVersion,
      candidate.sanitizerPolicyVersion,
    ];
    const suppliedCaptureFields = captureFields.filter(
      (value) => value !== undefined,
    ).length;
    if (suppliedCaptureFields !== 0 && suppliedCaptureFields !== 3) {
      context.addIssue({
        code: "custom",
        message: "Reader capture fields must be supplied together",
        path: ["contentHtml"],
      });
    }
  });

export type ExtensionCaptureCandidate = z.infer<
  typeof extensionCaptureCandidateSchema
>;

export type TrustedPageCapture = {
  contentHtml: string;
  contentHash: string;
  captureSource: "extension-live-dom" | "server-static-fetch";
  extractorVersion: string;
  sanitizerPolicyVersion: number;
  capturedAt: Date;
};

export type TrustedBookmarkObservation = {
  effectiveUrl: string;
  canonicalUrl: string;
  classification: BookmarkClassification;
  preview: BookmarkPreview;
  capture: TrustedPageCapture | null;
};

export type BookmarkObservationResult = {
  observation: TrustedBookmarkObservation;
  captureFailureReason?: CaptureFailureReason;
};
