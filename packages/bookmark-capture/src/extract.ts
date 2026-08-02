import { Readability } from "@mozilla/readability";
import {
  BOOKMARK_CAPTURE_LIMITS,
  READABILITY_EXTRACTOR_VERSION,
  SANITIZER_POLICY_VERSION,
} from "./policy";
import type {
  DiscoveredFeed,
  ExtensionCaptureFailureReason,
} from "./contracts";
import { boundedText, metaContent, resolvedHttpUrl } from "./metadata";
import { extractPagePreview } from "./preview";
import { sanitizeCaptureHtml } from "./sanitize";

export type ExtensionContentDescriptor = {
  platform: "website" | "youtube" | "peertube" | "nebula";
  contentType: "text" | "video";
  orientation: "horizontal" | "vertical" | null;
  contentId: string | null;
  classifierVersion: 1;
};

export type ExtensionCaptureCandidate = {
  effectiveUrl: string;
  canonicalUrl?: string;
  title: string;
  description?: string;
  author?: string;
  publishedAt?: string;
  siteName?: string;
  iconUrl?: string;
  thumbnailUrl?: string;
  descriptor: ExtensionContentDescriptor;
  contentHtml?: string;
  extractorVersion?: string;
  sanitizerPolicyVersion?: number;
};

export type ExtensionPageObservation = {
  sourceUrl: string;
  capture: ExtensionCaptureCandidate;
  captureFailureReason?: ExtensionCaptureFailureReason;
  feeds: DiscoveredFeed[];
};

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PEERTUBE_VIDEO_ID =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[A-Za-z0-9_-]{22})$/i;

function youtubeContentId(url: URL) {
  let candidate: string | null = null;
  if (url.hostname === "youtu.be")
    candidate = url.pathname.split("/")[1] ?? null;
  if (YOUTUBE_HOSTS.has(url.hostname)) {
    if (url.pathname === "/watch") candidate = url.searchParams.get("v");
    if (url.pathname.startsWith("/shorts/")) {
      candidate = url.pathname.split("/")[2] ?? null;
    }
  }
  return candidate && YOUTUBE_VIDEO_ID.test(candidate) ? candidate : null;
}

function peertubeContentId(url: URL) {
  const parts = url.pathname.split("/").filter(Boolean);
  const candidate =
    parts[0] === "w"
      ? parts[1]
      : parts[0] === "videos" && parts[1] === "watch"
        ? parts[2]
        : null;
  if (!candidate || !PEERTUBE_VIDEO_ID.test(candidate)) return null;
  return `${url.origin}|${candidate}`;
}

function schemaTypes(document: Document) {
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
        if (typeof type === "string") types.add(type.toLowerCase());
        if (Array.isArray(type)) {
          type.forEach((entry) => {
            if (typeof entry === "string") types.add(entry.toLowerCase());
          });
        }
        if (record["@graph"]) visit(record["@graph"]);
      };
      visit(JSON.parse(script.textContent || "null"));
    } catch {
      // Invalid page metadata is ignored locally and is never uploaded.
    }
  }
  return types;
}

function classifyDocument(
  document: Document,
  effectiveUrl: string,
  inspectStructuredData = true,
) {
  const url = new URL(effectiveUrl);
  const youtubeId = youtubeContentId(url);
  if (YOUTUBE_HOSTS.has(url.hostname)) {
    return {
      platform: "youtube",
      contentType: youtubeId ? "video" : "text",
      orientation:
        youtubeId && url.pathname.startsWith("/shorts/") ? "vertical" : null,
      contentId: youtubeId,
      classifierVersion: 1,
    } as const;
  }
  const peertubeId = peertubeContentId(url);
  const peerTubeMarker = [
    metaContent(document, 'meta[name="generator"]'),
    metaContent(document, 'meta[name="application-name"]'),
    metaContent(document, 'meta[property="og:site_name"]'),
  ].some((value) => value?.toLowerCase().includes("peertube"));
  if (peertubeId || peerTubeMarker) {
    return {
      platform: "peertube",
      contentType: peertubeId ? "video" : "text",
      orientation: null,
      contentId: peertubeId,
      classifierVersion: 1,
    } as const;
  }
  const normalizedHost = url.hostname.replace(/^www\./, "").toLowerCase();
  if (normalizedHost === "nebula.tv" || normalizedHost.endsWith(".nebula.tv")) {
    const contentId = url.pathname.match(/^\/videos\/([^/]+)/)?.[1] ?? null;
    return {
      platform: "nebula",
      contentType: contentId ? "video" : "text",
      orientation: contentId ? "horizontal" : null,
      contentId,
      classifierVersion: 1,
    } as const;
  }
  const videoEvidence =
    metaContent(document, 'meta[property="og:type"]')
      ?.toLowerCase()
      .startsWith("video") === true ||
    (inspectStructuredData && schemaTypes(document).has("videoobject"));
  const width = Number(
    metaContent(document, 'meta[property="og:video:width"]'),
  );
  const height = Number(
    metaContent(document, 'meta[property="og:video:height"]'),
  );
  return {
    platform: "website",
    contentType: videoEvidence ? "video" : "text",
    orientation:
      videoEvidence && width > 0 && height > 0
        ? height > width
          ? "vertical"
          : "horizontal"
        : null,
    contentId: null,
    classifierVersion: 1,
  } as const;
}

function normalizeLazyResources(document: Document) {
  const lazySourceAttributes = ["data-src", "data-lazy-src", "data-original"];
  for (const image of document.querySelectorAll<HTMLImageElement>("img")) {
    if (!image.getAttribute("src")) {
      const source = lazySourceAttributes
        .map((attribute) => image.getAttribute(attribute))
        .find(Boolean);
      if (source) image.setAttribute("src", source);
    }
    if (!image.getAttribute("srcset")) {
      const srcset = image.getAttribute("data-srcset");
      if (srcset) image.setAttribute("srcset", srcset);
    }
  }
}

function discoveredFeeds(document: Document, effectiveUrl: string) {
  const feeds = new Map<string, DiscoveredFeed>();
  for (const link of document.querySelectorAll<HTMLLinkElement>(
    'link[rel~="alternate"][href]',
  )) {
    const type = link.type.toLowerCase().split(";", 1)[0]?.trim();
    if (
      type !== "application/rss+xml" &&
      type !== "application/atom+xml" &&
      type !== "application/feed+json"
    ) {
      continue;
    }
    const url = resolvedHttpUrl(link.getAttribute("href"), effectiveUrl);
    if (!url || feeds.has(url)) continue;
    feeds.set(url, {
      url,
      ...(boundedText(link.title, BOOKMARK_CAPTURE_LIMITS.titleCodePoints)
        ? { title: link.title.trim() }
        : {}),
    });
  }
  return [...feeds.values()].slice(0, BOOKMARK_CAPTURE_LIMITS.discoveredFeeds);
}

export function extractPageObservation(
  document: Document,
): ExtensionPageObservation {
  const source = new URL(document.location.href);
  if (
    (source.protocol !== "http:" && source.protocol !== "https:") ||
    source.username ||
    source.password
  ) {
    throw new TypeError("The page URL is not eligible for capture");
  }
  const sourceUrl = source.toString();
  const effectiveUrl = sourceUrl;
  const tooLarge =
    document.querySelectorAll("*").length > BOOKMARK_CAPTURE_LIMITS.domElements;
  const descriptor = classifyDocument(document, effectiveUrl, !tooLarge);
  const feeds = discoveredFeeds(document, effectiveUrl);
  const canonicalUrl = resolvedHttpUrl(
    document.querySelector<HTMLLinkElement>('link[rel~="canonical"]')?.href,
    effectiveUrl,
  );
  const shouldExtractArticle =
    descriptor.platform === "website" &&
    descriptor.contentType === "text" &&
    !tooLarge;
  const clone = shouldExtractArticle
    ? (document.cloneNode(true) as Document)
    : null;
  if (clone) normalizeLazyResources(clone);
  const article = clone ? new Readability(clone).parse() : null;
  const preview = extractPagePreview({
    document,
    effectiveUrl,
    article,
    inspectStructuredData: !tooLarge,
    platform: descriptor.platform,
    contentType: descriptor.contentType,
  });
  const capture: ExtensionCaptureCandidate = {
    effectiveUrl,
    ...(canonicalUrl ? { canonicalUrl } : {}),
    ...preview,
    descriptor,
  };

  if (descriptor.platform !== "website" || descriptor.contentType !== "text") {
    return {
      sourceUrl,
      capture,
      captureFailureReason: "unsupported_content",
      feeds,
    };
  }
  if (tooLarge) {
    return { sourceUrl, capture, captureFailureReason: "too_large", feeds };
  }
  if (!article?.content) {
    return { sourceUrl, capture, captureFailureReason: "unextractable", feeds };
  }
  const sanitized = sanitizeCaptureHtml(
    article.content,
    effectiveUrl,
    document,
  );
  if (!("contentHtml" in sanitized)) {
    return {
      sourceUrl,
      capture,
      captureFailureReason: sanitized.reason,
      feeds,
    };
  }
  return {
    sourceUrl,
    capture: {
      ...capture,
      contentHtml: sanitized.contentHtml,
      extractorVersion: READABILITY_EXTRACTOR_VERSION,
      sanitizerPolicyVersion: SANITIZER_POLICY_VERSION,
    },
    feeds,
  };
}
