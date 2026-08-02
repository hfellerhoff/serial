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

function codePointLength(value: string) {
  return [...value].length;
}

function boundedText(value: string | null | undefined, maximum: number) {
  const normalized = value?.trim();
  if (!normalized || codePointLength(normalized) > maximum) return undefined;
  return normalized;
}

function resolvedHttpUrl(value: string | null | undefined, baseUrl: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value, baseUrl);
    if (
      url.username ||
      url.password ||
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      new TextEncoder().encode(url.toString()).byteLength >
        BOOKMARK_CAPTURE_LIMITS.urlBytes
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function metaContent(document: Document, selector: string) {
  return document.querySelector<HTMLMetaElement>(selector)?.content ?? null;
}

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

function classifyDocument(document: Document, effectiveUrl: string) {
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
      .startsWith("video") === true || schemaTypes(document).has("videoobject");
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
  const descriptor = classifyDocument(document, effectiveUrl);
  const tooLarge =
    document.querySelectorAll("*").length > BOOKMARK_CAPTURE_LIMITS.domElements;
  const clone = document.cloneNode(true) as Document;
  normalizeLazyResources(clone);
  const feeds = discoveredFeeds(clone, effectiveUrl);
  const canonicalUrl = resolvedHttpUrl(
    clone.querySelector<HTMLLinkElement>('link[rel~="canonical"]')?.href,
    effectiveUrl,
  );
  const article =
    descriptor.platform === "website" &&
    descriptor.contentType === "text" &&
    !tooLarge
      ? new Readability(clone).parse()
      : null;
  const capture: ExtensionCaptureCandidate = {
    effectiveUrl,
    ...(canonicalUrl ? { canonicalUrl } : {}),
    title:
      boundedText(
        metaContent(document, 'meta[property="og:title"]') ??
          article?.title ??
          document.title,
        BOOKMARK_CAPTURE_LIMITS.titleCodePoints,
      ) ?? new URL(effectiveUrl).hostname,
    ...(boundedText(
      metaContent(document, 'meta[property="og:description"]') ??
        metaContent(document, 'meta[name="description"]') ??
        article?.excerpt,
      BOOKMARK_CAPTURE_LIMITS.descriptionCodePoints,
    )
      ? {
          description: boundedText(
            metaContent(document, 'meta[property="og:description"]') ??
              metaContent(document, 'meta[name="description"]') ??
              article?.excerpt,
            BOOKMARK_CAPTURE_LIMITS.descriptionCodePoints,
          ),
        }
      : {}),
    ...(boundedText(
      article?.byline ?? metaContent(document, 'meta[name="author"]'),
      BOOKMARK_CAPTURE_LIMITS.authorCodePoints,
    )
      ? {
          author: boundedText(
            article?.byline ?? metaContent(document, 'meta[name="author"]'),
            BOOKMARK_CAPTURE_LIMITS.authorCodePoints,
          ),
        }
      : {}),
    ...(boundedText(
      metaContent(document, 'meta[property="og:site_name"]'),
      BOOKMARK_CAPTURE_LIMITS.siteNameCodePoints,
    )
      ? {
          siteName: boundedText(
            metaContent(document, 'meta[property="og:site_name"]'),
            BOOKMARK_CAPTURE_LIMITS.siteNameCodePoints,
          ),
        }
      : {}),
    ...(boundedText(
      article?.publishedTime ??
        metaContent(document, 'meta[property="article:published_time"]'),
      BOOKMARK_CAPTURE_LIMITS.descriptionCodePoints,
    )
      ? {
          publishedAt:
            article?.publishedTime ??
            metaContent(document, 'meta[property="article:published_time"]') ??
            undefined,
        }
      : {}),
    ...(resolvedHttpUrl(
      document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href,
      effectiveUrl,
    )
      ? {
          iconUrl: resolvedHttpUrl(
            document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href,
            effectiveUrl,
          ),
        }
      : {}),
    ...(resolvedHttpUrl(
      metaContent(
        document,
        'meta[property="og:image"], meta[name="twitter:image"]',
      ),
      effectiveUrl,
    )
      ? {
          thumbnailUrl: resolvedHttpUrl(
            metaContent(
              document,
              'meta[property="og:image"], meta[name="twitter:image"]',
            ),
            effectiveUrl,
          ),
        }
      : {}),
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
