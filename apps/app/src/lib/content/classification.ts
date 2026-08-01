import {
  compareObservationSources,
  CONTENT_PLATFORM,
  CONTENT_TYPE,
  normalizeContentDescriptor,
  OBSERVATION_SOURCE,
  VIDEO_ORIENTATION,
} from "./descriptor";
import type {
  ContentDescriptor,
  ContentPlatform,
  ObservationSource,
  VideoOrientation,
} from "./descriptor";

export const CONTENT_CLASSIFIER_VERSION = 1;

export type BookmarkClassification = ContentDescriptor & {
  classificationSource: ObservationSource;
  classifierVersion: number;
};

export type BookmarkPreviewFields = {
  title: string;
  description: string | null;
  author: string | null;
  siteName: string | null;
  publishedAt: Date | null;
  thumbnailUrl: string | null;
  iconUrl: string | null;
};

export type BookmarkPreview = BookmarkPreviewFields & {
  previewSource: ObservationSource;
};

export type PreviewCandidate = Partial<BookmarkPreviewFields> & {
  source: ObservationSource;
};

export type DocumentClassificationEvidence = {
  primaryUrl: string;
  source: Exclude<ObservationSource, "url">;
  ogType?: string | null;
  schemaTypes?: readonly string[];
  videoOrientation?: VideoOrientation | null;
  contentId?: string | null;
  platformHint?: ContentPlatform;
};

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PEERTUBE_VIDEO_ID =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[A-Za-z0-9_-]{22})$/i;

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function youtubeHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return host === "youtube.com" || host === "m.youtube.com";
}

function youtubeContentId(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let candidate: string | null = null;
  if (host === "youtu.be") candidate = url.pathname.split("/")[1] ?? null;
  if (youtubeHost(host)) {
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

export function isValidNativeContentId(
  platform: ContentDescriptor["platform"],
  contentId: string | null,
) {
  if (!contentId) return false;
  switch (platform) {
    case CONTENT_PLATFORM.YOUTUBE:
      return YOUTUBE_VIDEO_ID.test(contentId);
    case CONTENT_PLATFORM.PEERTUBE: {
      const separator = contentId.lastIndexOf("|");
      if (separator < 1) return false;
      const origin = safeUrl(contentId.slice(0, separator));
      return Boolean(
        origin && PEERTUBE_VIDEO_ID.test(contentId.slice(separator + 1)),
      );
    }
    case CONTENT_PLATFORM.NEBULA:
      return contentId.length > 0;
    case CONTENT_PLATFORM.WEBSITE:
      return false;
  }
}

export function isValidNativeContentIdForUrl(input: {
  platform: ContentDescriptor["platform"];
  contentId: string | null;
  primaryUrl: string;
}) {
  if (!isValidNativeContentId(input.platform, input.contentId)) return false;
  if (input.platform !== CONTENT_PLATFORM.PEERTUBE) return true;
  const url = safeUrl(input.primaryUrl);
  const separator = input.contentId!.lastIndexOf("|");
  const identityOrigin = safeUrl(input.contentId!.slice(0, separator));
  return Boolean(url && identityOrigin && url.origin === identityOrigin.origin);
}

function isLikelyPeerTubeUrl(url: URL) {
  return peertubeContentId(url) !== null;
}

function isNebulaUrl(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return host === "nebula.tv" || host.endsWith(".nebula.tv");
}

export function readableTitleFromUrl(value: string) {
  const url = safeUrl(value);
  if (!url) return value.trim() || "Untitled Bookmark";
  const meaningfulSegment = url.pathname.split("/").filter(Boolean).at(-1);
  if (meaningfulSegment) {
    try {
      const decoded = decodeURIComponent(meaningfulSegment)
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (decoded) return decoded;
    } catch {
      // Fall through to a readable host when the path is malformed.
    }
  }
  return url.hostname.replace(/^www\./, "");
}

export function classifyUrl(value: string): BookmarkClassification {
  const url = safeUrl(value);
  if (!url) {
    return {
      platform: CONTENT_PLATFORM.WEBSITE,
      contentType: CONTENT_TYPE.TEXT,
      orientation: null,
      contentId: null,
      classificationSource: OBSERVATION_SOURCE.URL,
      classifierVersion: CONTENT_CLASSIFIER_VERSION,
    };
  }

  const youtubeId = youtubeContentId(url);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (youtubeHost(host) || host === "youtu.be") {
    const isShort = url.pathname.startsWith("/shorts/") && youtubeId !== null;
    return {
      platform: CONTENT_PLATFORM.YOUTUBE,
      contentType: youtubeId ? CONTENT_TYPE.VIDEO : CONTENT_TYPE.TEXT,
      orientation: isShort ? VIDEO_ORIENTATION.VERTICAL : null,
      contentId: youtubeId,
      classificationSource: OBSERVATION_SOURCE.URL,
      classifierVersion: CONTENT_CLASSIFIER_VERSION,
    };
  }

  if (isLikelyPeerTubeUrl(url)) {
    return {
      platform: CONTENT_PLATFORM.PEERTUBE,
      contentType: CONTENT_TYPE.VIDEO,
      orientation: null,
      contentId: peertubeContentId(url),
      classificationSource: OBSERVATION_SOURCE.URL,
      classifierVersion: CONTENT_CLASSIFIER_VERSION,
    };
  }

  if (isNebulaUrl(url)) {
    const videoSlug = url.pathname.match(/^\/videos\/([^/]+)/)?.[1] ?? null;
    return {
      platform: CONTENT_PLATFORM.NEBULA,
      contentType: videoSlug ? CONTENT_TYPE.VIDEO : CONTENT_TYPE.TEXT,
      orientation: videoSlug ? VIDEO_ORIENTATION.HORIZONTAL : null,
      contentId: videoSlug,
      classificationSource: OBSERVATION_SOURCE.URL,
      classifierVersion: CONTENT_CLASSIFIER_VERSION,
    };
  }

  return {
    platform: CONTENT_PLATFORM.WEBSITE,
    contentType: CONTENT_TYPE.TEXT,
    orientation: null,
    contentId: null,
    classificationSource: OBSERVATION_SOURCE.URL,
    classifierVersion: CONTENT_CLASSIFIER_VERSION,
  };
}

export function classifyDocument(
  evidence: DocumentClassificationEvidence,
): BookmarkClassification {
  const urlClassification = classifyUrl(evidence.primaryUrl);
  const platform =
    urlClassification.platform === CONTENT_PLATFORM.WEBSITE &&
    evidence.platformHint === CONTENT_PLATFORM.PEERTUBE
      ? CONTENT_PLATFORM.PEERTUBE
      : urlClassification.platform;
  const strongPrimaryVideoEvidence =
    evidence.ogType?.toLowerCase().startsWith("video") === true ||
    evidence.schemaTypes?.some(
      (type) => type.toLowerCase() === "videoobject",
    ) === true;
  const descriptor = normalizeContentDescriptor({
    platform,
    contentType: strongPrimaryVideoEvidence
      ? CONTENT_TYPE.VIDEO
      : urlClassification.contentType,
    orientation:
      strongPrimaryVideoEvidence ||
      urlClassification.contentType === CONTENT_TYPE.VIDEO
        ? (evidence.videoOrientation ?? urlClassification.orientation)
        : null,
    contentId:
      evidence.contentId &&
      isValidNativeContentIdForUrl({
        platform,
        contentId: evidence.contentId,
        primaryUrl: evidence.primaryUrl,
      })
        ? evidence.contentId
        : platform === urlClassification.platform
          ? urlClassification.contentId
          : null,
  });
  return {
    ...descriptor,
    classificationSource: evidence.source,
    classifierVersion: CONTENT_CLASSIFIER_VERSION,
  };
}

export function mergeClassification(
  current: BookmarkClassification,
  candidate: BookmarkClassification,
): BookmarkClassification {
  if (
    compareObservationSources(
      candidate.classificationSource,
      current.classificationSource,
    ) >= 0
  ) {
    return { ...candidate, ...normalizeContentDescriptor(candidate) };
  }

  const samePlatform = current.platform === candidate.platform;
  return {
    ...current,
    orientation:
      samePlatform &&
      current.contentType === CONTENT_TYPE.VIDEO &&
      candidate.contentType === CONTENT_TYPE.VIDEO
        ? (current.orientation ?? candidate.orientation)
        : current.orientation,
    contentId: samePlatform
      ? (current.contentId ?? candidate.contentId)
      : current.contentId,
  };
}

export function createFallbackPreview(
  sourceUrl: string,
  source = OBSERVATION_SOURCE.URL,
): BookmarkPreview {
  return {
    title: readableTitleFromUrl(sourceUrl),
    description: null,
    author: null,
    siteName: safeUrl(sourceUrl)?.hostname.replace(/^www\./, "") ?? null,
    publishedAt: null,
    thumbnailUrl: null,
    iconUrl: null,
    previewSource: source,
  };
}

const PREVIEW_FIELDS = [
  "title",
  "description",
  "author",
  "siteName",
  "publishedAt",
  "thumbnailUrl",
  "iconUrl",
] as const satisfies ReadonlyArray<keyof BookmarkPreviewFields>;

function populatedPreviewValue<TKey extends keyof BookmarkPreviewFields>(
  value: BookmarkPreviewFields[TKey] | undefined,
) {
  return value !== undefined && value !== null && value !== "";
}

export function mergePreview(
  current: BookmarkPreview,
  candidate: PreviewCandidate,
): BookmarkPreview {
  const candidateWins =
    compareObservationSources(candidate.source, current.previewSource) >= 0;
  const next = { ...current };
  let usedCandidate = false;

  for (const field of PREVIEW_FIELDS) {
    const candidateValue = candidate[field];
    if (!populatedPreviewValue(candidateValue)) continue;
    if (candidateWins || !populatedPreviewValue(current[field])) {
      Object.assign(next, { [field]: candidateValue });
      usedCandidate = true;
    }
  }

  if (candidateWins && usedCandidate) next.previewSource = candidate.source;
  return next;
}

export function youtubeThumbnailUrl(contentId: string | null) {
  return contentId && YOUTUBE_VIDEO_ID.test(contentId)
    ? `https://i.ytimg.com/vi/${contentId}/hqdefault.jpg`
    : null;
}
