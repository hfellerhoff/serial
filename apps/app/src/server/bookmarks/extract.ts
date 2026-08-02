import { Readability } from "@mozilla/readability";
import { selectBookmarkPreviewThumbnail } from "@serial/bookmark-capture";
import { JSDOM } from "jsdom";
import {
  BOOKMARK_CAPTURE_LIMITS,
  READABILITY_EXTRACTOR_VERSION,
} from "./contracts";
import { InvalidCaptureHtmlError, sanitizeCaptureHtml } from "./sanitize";
import {
  chooseCanonicalUrl,
  normalizeBookmarkUrl,
  resolveOptionalHttpUrl,
} from "./url";
import type {
  BookmarkObservationResult,
  CaptureFailureReason,
  ExtensionCaptureCandidate,
  TrustedBookmarkObservation,
  TrustedPageCapture,
} from "./contracts";
import type {
  BookmarkClassification,
  BookmarkPreview,
  PreviewCandidate,
} from "~/lib/content/classification";
import {
  classifyDocument,
  classifyUrl,
  CONTENT_CLASSIFIER_VERSION,
  createFallbackPreview,
  isValidNativeContentIdForUrl,
  mergePreview,
} from "~/lib/content/classification";
import {
  CONTENT_PLATFORM,
  CONTENT_TYPE,
  normalizeContentDescriptor,
  OBSERVATION_SOURCE,
  VIDEO_ORIENTATION,
} from "~/lib/content/descriptor";
import { canRetainPageCapture } from "~/lib/content/capabilities";

export type ObservationPreparationResult =
  | { ok: true; result: BookmarkObservationResult }
  | { ok: false; reason: CaptureFailureReason };

function optionalPublishedAt(value: string | undefined | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function codePointLength(value: string) {
  return [...value].length;
}

function boundedText(value: string | null | undefined, maximum: number) {
  const normalized = value?.trim();
  if (!normalized) return null;
  return codePointLength(normalized) <= maximum ? normalized : null;
}

function buildPageCapture(input: {
  effectiveUrl: string;
  contentHtml: string;
  captureSource: TrustedPageCapture["captureSource"];
  extractorVersion: string;
}): TrustedPageCapture {
  const sanitized = sanitizeCaptureHtml({
    contentHtml: input.contentHtml,
    effectiveUrl: input.effectiveUrl,
  });
  return {
    contentHtml: sanitized.contentHtml,
    contentHash: sanitized.contentHash,
    captureSource: input.captureSource,
    extractorVersion: input.extractorVersion,
    sanitizerPolicyVersion: sanitized.sanitizerPolicyVersion,
    capturedAt: new Date(),
  };
}

function normalizeClassification(
  classification: BookmarkClassification,
): BookmarkClassification {
  const descriptor = normalizeContentDescriptor(classification);
  return { ...classification, ...descriptor };
}

function buildObservation(input: {
  sourceUrl: string;
  effectiveUrl: string;
  canonicalUrl?: string | null;
  classification: BookmarkClassification;
  preview: BookmarkPreview;
  capture: TrustedPageCapture | null;
}): TrustedBookmarkObservation {
  const effectiveUrl = normalizeBookmarkUrl(input.effectiveUrl);
  return {
    effectiveUrl,
    canonicalUrl: chooseCanonicalUrl({
      sourceUrl: input.sourceUrl,
      effectiveUrl,
      canonicalUrl: input.canonicalUrl ?? undefined,
    }),
    classification: normalizeClassification(input.classification),
    preview: input.preview,
    capture: input.capture,
  };
}

export function buildUrlFallbackObservation(
  sourceUrl: string,
): TrustedBookmarkObservation {
  const normalized = normalizeBookmarkUrl(sourceUrl);
  const classification = classifyUrl(normalized);
  let preview = createFallbackPreview(normalized);
  preview = mergePreview(preview, {
    source: OBSERVATION_SOURCE.URL,
    thumbnailUrl: selectBookmarkPreviewThumbnail({
      ...classification,
      observedThumbnailUrl: preview.thumbnailUrl,
    }),
  });
  return buildObservation({
    sourceUrl: normalized,
    effectiveUrl: normalized,
    classification,
    preview,
    capture: null,
  });
}

function validatedExtensionClassification(input: {
  effectiveUrl: string;
  candidate: ExtensionCaptureCandidate;
}): BookmarkClassification {
  const inferred = classifyUrl(input.effectiveUrl);
  const candidate = input.candidate.descriptor;
  const candidatePeerTubePage =
    inferred.platform === CONTENT_PLATFORM.WEBSITE &&
    candidate.platform === CONTENT_PLATFORM.PEERTUBE;
  const platform = candidatePeerTubePage
    ? candidate.platform
    : inferred.platform;
  const contentType =
    candidate.platform === platform
      ? candidate.contentType
      : inferred.contentType;
  const contentId =
    candidate.platform === platform &&
    isValidNativeContentIdForUrl({
      platform,
      contentId: candidate.contentId,
      primaryUrl: input.effectiveUrl,
    })
      ? candidate.contentId
      : platform === inferred.platform
        ? inferred.contentId
        : null;
  let orientation =
    contentType === CONTENT_TYPE.VIDEO
      ? (candidate.orientation ?? inferred.orientation)
      : null;
  if (
    platform === CONTENT_PLATFORM.NEBULA &&
    contentType === CONTENT_TYPE.VIDEO
  ) {
    orientation = VIDEO_ORIENTATION.HORIZONTAL;
  }
  return normalizeClassification({
    platform,
    contentType,
    orientation,
    contentId,
    classificationSource: OBSERVATION_SOURCE.EXTENSION_LIVE_DOM,
    classifierVersion: CONTENT_CLASSIFIER_VERSION,
  });
}

function extensionPreview(input: {
  sourceUrl: string;
  effectiveUrl: string;
  candidate: ExtensionCaptureCandidate;
  classification: BookmarkClassification;
}) {
  const source = OBSERVATION_SOURCE.EXTENSION_LIVE_DOM;
  const fallback = createFallbackPreview(input.sourceUrl);
  return mergePreview(fallback, {
    source,
    title:
      boundedText(
        input.candidate.title,
        BOOKMARK_CAPTURE_LIMITS.titleCodePoints,
      ) ?? fallback.title,
    description: boundedText(
      input.candidate.description,
      BOOKMARK_CAPTURE_LIMITS.descriptionCodePoints,
    ),
    author: boundedText(
      input.candidate.author,
      BOOKMARK_CAPTURE_LIMITS.authorCodePoints,
    ),
    siteName: boundedText(
      input.candidate.siteName,
      BOOKMARK_CAPTURE_LIMITS.siteNameCodePoints,
    ),
    publishedAt: optionalPublishedAt(input.candidate.publishedAt),
    thumbnailUrl: selectBookmarkPreviewThumbnail({
      ...input.classification,
      observedThumbnailUrl: resolveOptionalHttpUrl(
        input.candidate.thumbnailUrl,
        input.effectiveUrl,
      ),
    }),
    iconUrl: resolveOptionalHttpUrl(
      input.candidate.iconUrl,
      input.effectiveUrl,
    ),
  });
}

export function prepareExtensionCapture(input: {
  sourceUrl: string;
  candidate: ExtensionCaptureCandidate;
}): ObservationPreparationResult {
  if (
    input.candidate.contentHtml !== undefined &&
    (input.candidate.extractorVersion !== READABILITY_EXTRACTOR_VERSION ||
      input.candidate.sanitizerPolicyVersion !== 1)
  ) {
    return { ok: false, reason: "unsupported_capture_version" };
  }

  try {
    const effectiveUrl = normalizeBookmarkUrl(input.candidate.effectiveUrl);
    const classification = validatedExtensionClassification({
      effectiveUrl,
      candidate: input.candidate,
    });
    const preview = extensionPreview({
      ...input,
      effectiveUrl,
      classification,
    });
    const captureAllowed = canRetainPageCapture(classification);
    const capture =
      captureAllowed && input.candidate.contentHtml
        ? buildPageCapture({
            effectiveUrl,
            contentHtml: input.candidate.contentHtml,
            captureSource: OBSERVATION_SOURCE.EXTENSION_LIVE_DOM,
            extractorVersion: input.candidate.extractorVersion!,
          })
        : null;
    return {
      ok: true,
      result: {
        observation: buildObservation({
          sourceUrl: input.sourceUrl,
          effectiveUrl,
          canonicalUrl: input.candidate.canonicalUrl,
          classification,
          preview,
          capture,
        }),
        ...(captureAllowed && !capture
          ? { captureFailureReason: "unextractable" as const }
          : !captureAllowed
            ? { captureFailureReason: "unsupported_content" as const }
            : {}),
      },
    };
  } catch {
    return { ok: false, reason: "invalid_capture" };
  }
}

function metaContent(document: Document, selector: string) {
  return document.querySelector<HTMLMetaElement>(selector)?.content ?? null;
}

function documentSchemaTypes(document: Document) {
  const types = new Set<string>();
  for (const script of document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  )) {
    try {
      const visit = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        const record = value as Record<string, unknown>;
        const type = record["@type"];
        if (typeof type === "string") types.add(type);
        if (Array.isArray(type)) {
          type
            .filter((item): item is string => typeof item === "string")
            .forEach((item) => types.add(item));
        }
        if (Array.isArray(record["@graph"])) visit(record["@graph"]);
      };
      visit(JSON.parse(script.textContent || "null"));
    } catch {
      // Invalid JSON-LD cannot provide classification evidence.
    }
  }
  return [...types];
}

function documentPlatformHint(document: Document) {
  const markers = [
    metaContent(document, 'meta[name="generator"]'),
    metaContent(document, 'meta[name="application-name"]'),
    metaContent(document, 'meta[property="og:site_name"]'),
  ];
  return markers.some((value) => value?.toLowerCase().includes("peertube"))
    ? CONTENT_PLATFORM.PEERTUBE
    : undefined;
}

function staticPreviewCandidate(input: {
  document: Document;
  article: ReturnType<Readability["parse"]>;
  effectiveUrl: string;
  classification: BookmarkClassification;
}): PreviewCandidate {
  const { document, article, effectiveUrl, classification } = input;
  const ogDescription = metaContent(
    document,
    'meta[property="og:description"]',
  );
  const description =
    boundedText(
      ogDescription ?? article?.excerpt,
      BOOKMARK_CAPTURE_LIMITS.descriptionCodePoints,
    ) ?? null;
  return {
    source: OBSERVATION_SOURCE.SERVER_STATIC_FETCH,
    title:
      boundedText(
        metaContent(document, 'meta[property="og:title"]') ??
          article?.title ??
          document.title,
        BOOKMARK_CAPTURE_LIMITS.titleCodePoints,
      ) ?? undefined,
    description,
    author: boundedText(
      article?.byline ?? metaContent(document, 'meta[name="author"]'),
      BOOKMARK_CAPTURE_LIMITS.authorCodePoints,
    ),
    siteName: boundedText(
      metaContent(document, 'meta[property="og:site_name"]'),
      BOOKMARK_CAPTURE_LIMITS.siteNameCodePoints,
    ),
    publishedAt: optionalPublishedAt(
      article?.publishedTime ??
        metaContent(document, 'meta[property="article:published_time"]'),
    ),
    thumbnailUrl: selectBookmarkPreviewThumbnail({
      ...classification,
      observedThumbnailUrl: resolveOptionalHttpUrl(
        metaContent(
          document,
          'meta[property="og:image"], meta[name="twitter:image"]',
        ),
        effectiveUrl,
      ),
    }),
    iconUrl: resolveOptionalHttpUrl(
      document.querySelector('link[rel~="icon"]')?.getAttribute("href"),
      effectiveUrl,
    ),
  };
}

export function extractStaticCapture(input: {
  sourceUrl: string;
  effectiveUrl: string;
  html: string;
}): BookmarkObservationResult {
  const dom = new JSDOM(input.html, {
    url: input.effectiveUrl,
    runScripts: "outside-only",
  });

  try {
    const { document } = dom.window;
    const tooLarge =
      document.querySelectorAll("*").length >
      BOOKMARK_CAPTURE_LIMITS.domElements;
    const canonicalUrl = document
      .querySelector('link[rel~="canonical"]')
      ?.getAttribute("href");
    const ogType = metaContent(document, 'meta[property="og:type"]');
    const classification = classifyDocument({
      primaryUrl: input.effectiveUrl,
      source: OBSERVATION_SOURCE.SERVER_STATIC_FETCH,
      ogType,
      schemaTypes: tooLarge ? [] : documentSchemaTypes(document),
      platformHint: documentPlatformHint(document),
    });
    const article = tooLarge
      ? null
      : new Readability(document.cloneNode(true) as Document).parse();
    const preview = mergePreview(
      createFallbackPreview(input.sourceUrl),
      staticPreviewCandidate({
        document,
        article,
        effectiveUrl: input.effectiveUrl,
        classification,
      }),
    );
    const captureAllowed = canRetainPageCapture(classification);
    let capture: TrustedPageCapture | null = null;
    let captureFailureReason: CaptureFailureReason | undefined;

    if (!captureAllowed) {
      captureFailureReason = "unsupported_content";
    } else if (tooLarge) {
      captureFailureReason = "too_large";
    } else if (!article?.content) {
      captureFailureReason = "unextractable";
    } else {
      try {
        capture = buildPageCapture({
          effectiveUrl: normalizeBookmarkUrl(input.effectiveUrl),
          contentHtml: article.content,
          captureSource: OBSERVATION_SOURCE.SERVER_STATIC_FETCH,
          extractorVersion: READABILITY_EXTRACTOR_VERSION,
        });
      } catch (error) {
        captureFailureReason =
          error instanceof InvalidCaptureHtmlError
            ? "invalid_capture"
            : "unextractable";
      }
    }

    return {
      observation: buildObservation({
        sourceUrl: input.sourceUrl,
        effectiveUrl: input.effectiveUrl,
        canonicalUrl,
        classification,
        preview,
        capture,
      }),
      ...(captureFailureReason ? { captureFailureReason } : {}),
    };
  } finally {
    dom.window.close();
  }
}
