import { Readability } from "@mozilla/readability";
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
  CaptureFailureReason,
  ExtensionCaptureCandidate,
  TrustedCapture,
} from "./contracts";

export type CapturePreparationResult =
  | { ok: true; capture: TrustedCapture }
  | { ok: false; reason: CaptureFailureReason };

function optionalPublishedAt(value: string | undefined | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function codePointLength(value: string) {
  return [...value].length;
}

function buildTrustedCapture(input: {
  sourceUrl: string;
  effectiveUrl: string;
  canonicalUrl?: string | null;
  title: string;
  author?: string | null;
  publishedAt?: string | null;
  iconUrl?: string | null;
  representativeImageUrl?: string | null;
  contentHtml: string;
  captureSource: TrustedCapture["captureSource"];
  extractorVersion: string;
}): TrustedCapture {
  if (
    !input.title.trim() ||
    codePointLength(input.title) > BOOKMARK_CAPTURE_LIMITS.titleCodePoints
  ) {
    throw new InvalidCaptureHtmlError("The capture title is invalid");
  }

  const effectiveUrl = normalizeBookmarkUrl(input.effectiveUrl);
  const sanitized = sanitizeCaptureHtml({
    contentHtml: input.contentHtml,
    effectiveUrl,
  });
  const author =
    input.author &&
    codePointLength(input.author) <= BOOKMARK_CAPTURE_LIMITS.authorCodePoints
      ? input.author
      : null;

  return {
    title: input.title.trim(),
    author,
    publishedAt: optionalPublishedAt(input.publishedAt),
    contentHtml: sanitized.contentHtml,
    effectiveUrl,
    canonicalUrl: chooseCanonicalUrl({
      sourceUrl: input.sourceUrl,
      effectiveUrl,
      canonicalUrl: input.canonicalUrl ?? undefined,
    }),
    iconUrl: resolveOptionalHttpUrl(input.iconUrl, effectiveUrl),
    representativeImageUrl: resolveOptionalHttpUrl(
      input.representativeImageUrl,
      effectiveUrl,
    ),
    contentHash: sanitized.contentHash,
    captureSource: input.captureSource,
    extractorVersion: input.extractorVersion,
    sanitizerPolicyVersion: sanitized.sanitizerPolicyVersion,
    capturedAt: new Date(),
  };
}

export function prepareExtensionCapture(input: {
  sourceUrl: string;
  candidate: ExtensionCaptureCandidate;
}): CapturePreparationResult {
  if (
    input.candidate.extractorVersion !== READABILITY_EXTRACTOR_VERSION ||
    input.candidate.sanitizerPolicyVersion !== 1
  ) {
    return { ok: false, reason: "unsupported_capture_version" };
  }

  try {
    return {
      ok: true,
      capture: buildTrustedCapture({
        sourceUrl: input.sourceUrl,
        ...input.candidate,
        captureSource: "extension-live-dom",
      }),
    };
  } catch {
    return { ok: false, reason: "invalid_capture" };
  }
}

export function extractStaticCapture(input: {
  sourceUrl: string;
  effectiveUrl: string;
  html: string;
}): CapturePreparationResult {
  const dom = new JSDOM(input.html, {
    url: input.effectiveUrl,
    runScripts: "outside-only",
  });

  try {
    const { document } = dom.window;
    if (
      document.querySelectorAll("*").length >
      BOOKMARK_CAPTURE_LIMITS.domElements
    ) {
      return { ok: false, reason: "too_large" };
    }

    const canonicalUrl = document
      .querySelector('link[rel~="canonical"]')
      ?.getAttribute("href");
    const iconUrl = document
      .querySelector('link[rel~="icon"]')
      ?.getAttribute("href");
    const representativeImageUrl = document
      .querySelector('meta[property="og:image"], meta[name="twitter:image"]')
      ?.getAttribute("content");
    const article = new Readability(
      document.cloneNode(true) as Document,
    ).parse();
    if (!article?.content || !article.title) {
      return { ok: false, reason: "unextractable" };
    }

    try {
      return {
        ok: true,
        capture: buildTrustedCapture({
          sourceUrl: input.sourceUrl,
          effectiveUrl: input.effectiveUrl,
          canonicalUrl,
          title: article.title,
          author: article.byline,
          publishedAt: article.publishedTime,
          iconUrl,
          representativeImageUrl,
          contentHtml: article.content,
          captureSource: "server-static-fetch",
          extractorVersion: READABILITY_EXTRACTOR_VERSION,
        }),
      };
    } catch {
      return { ok: false, reason: "invalid_capture" };
    }
  } finally {
    dom.window.close();
  }
}
