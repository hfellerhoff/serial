import { z } from "zod";

export const BOOKMARK_CAPTURE_LIMITS = {
  extensionRequestBytes: 4 * 1024 * 1024,
  storedHtmlBytes: 2 * 1024 * 1024,
  fetchedHtmlBytes: 5 * 1024 * 1024,
  domElements: 50_000,
  redirects: 5,
  responseHeadersMs: 5_000,
  totalAttemptMs: 15_000,
  urlBytes: 8 * 1024,
  titleCodePoints: 1_024,
  authorCodePoints: 512,
  versionBytes: 128,
} as const;

export const SANITIZER_POLICY_VERSION = 1;
export const EXTENSION_BOOKMARK_CONTRACT_VERSION = 1;
export const READABILITY_EXTRACTOR_VERSION = "mozilla-readability-0.6";

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

export const extensionCaptureCandidateSchema = z.strictObject({
  effectiveUrl: boundedUrlString,
  canonicalUrl: z.unknown().transform(optionalBoundedUrlString).optional(),
  title: boundedString(BOOKMARK_CAPTURE_LIMITS.titleCodePoints),
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
  iconUrl: z.unknown().transform(optionalBoundedUrlString).optional(),
  representativeImageUrl: z
    .unknown()
    .transform(optionalBoundedUrlString)
    .optional(),
  contentHtml: z.string().min(1),
  extractorVersion: versionString,
  sanitizerPolicyVersion: z.number().int().positive(),
});

export type ExtensionCaptureCandidate = z.infer<
  typeof extensionCaptureCandidateSchema
>;

export type TrustedCapture = {
  title: string;
  author: string | null;
  publishedAt: Date | null;
  contentHtml: string;
  effectiveUrl: string;
  canonicalUrl: string;
  iconUrl: string | null;
  representativeImageUrl: string | null;
  contentHash: string;
  captureSource: "extension-live-dom" | "server-static-fetch";
  extractorVersion: string;
  sanitizerPolicyVersion: number;
  capturedAt: Date;
};
