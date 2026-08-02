import type {
  BookmarkContentPlatform,
  BookmarkContentType,
} from "./capabilities";
import { boundedText, metaContent, resolvedHttpUrl } from "./metadata";
import { BOOKMARK_CAPTURE_LIMITS } from "./policy";
import { selectBookmarkPreviewThumbnail } from "./thumbnail";

export type PreviewArticleMetadata = {
  title?: string | null;
  excerpt?: string | null;
  byline?: string | null;
  publishedTime?: string | null;
};

export type ExtractedPagePreview = {
  title: string;
  description?: string;
  author?: string;
  publishedAt?: string;
  siteName?: string;
  iconUrl?: string;
  thumbnailUrl?: string;
};

type PreviewExtractionInput = {
  document: Document;
  effectiveUrl: string;
  article: PreviewArticleMetadata | null;
  inspectStructuredData: boolean;
  contentId: string | null;
};

type PreviewStrategy = (
  input: PreviewExtractionInput,
  generalPreview: ExtractedPagePreview,
) => ExtractedPagePreview;

function firstBoundedText(
  candidates: Array<string | null | undefined>,
  maximum: number,
) {
  for (const candidate of candidates) {
    const value = boundedText(candidate, maximum);
    if (value) return value;
  }
  return undefined;
}

function firstResolvedHttpUrl(
  candidates: Array<string | null | undefined>,
  baseUrl: string,
) {
  for (const candidate of candidates) {
    const value = resolvedHttpUrl(candidate, baseUrl);
    if (value) return value;
  }
  return undefined;
}

function elementTextOrContent(document: Document, selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  return element?.getAttribute("content") ?? element?.textContent ?? null;
}

type StructuredImageCandidate = {
  value: string;
  score: number;
  order: number;
};

type DocumentImageCandidate = {
  url: string;
  score: number;
  order: number;
};

const IMAGE_RANKING = {
  minimumWidth: 180,
  minimumHeight: 100,
  minimumArea: 24_000,
  minimumAspectRatio: 0.2,
  maximumAspectRatio: 5,
  articleScore: 5_000,
  mainScore: 3_000,
  figureScore: 1_000,
  semanticPenalty: 6_000,
  maximumDimensionScore: 2_500,
  minimumCandidateScore: 500,
} as const;

const LOW_QUALITY_IMAGE_MARKER =
  /(?:^|[-_/.])(avatar|badge|emoji|icon|logo|pixel|sprite|tracker|tracking)(?:[-_/.]|$)/i;

function structuredRecords(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(structuredRecords);
  const record = value as Record<string, unknown>;
  return [record, ...structuredRecords(record["@graph"])];
}

function structuredImageValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(structuredImageValues);
  const record = value as Record<string, unknown>;
  return [
    ...structuredImageValues(record.contentUrl),
    ...structuredImageValues(record.url),
    ...structuredImageValues(record["@id"]),
  ];
}

function structuredTypeScore(value: unknown) {
  const types = (Array.isArray(value) ? value : [value]).filter(
    (entry): entry is string => typeof entry === "string",
  );
  if (
    types.some((type) =>
      ["article", "newsarticle", "blogposting", "videoobject"].includes(
        type.toLowerCase(),
      ),
    )
  ) {
    return 30;
  }
  return types.some((type) => type.toLowerCase() === "webpage") ? 20 : 10;
}

function structuredImageUrl(document: Document, effectiveUrl: string) {
  const candidates: StructuredImageCandidate[] = [];
  let order = 0;
  for (const script of document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/ld+json"]',
  )) {
    try {
      for (const record of structuredRecords(
        JSON.parse(script.textContent || "null"),
      )) {
        const typeScore = structuredTypeScore(record["@type"]);
        const properties = [
          ["primaryImageOfPage", 3],
          ["image", 2],
          ["thumbnailUrl", 1],
        ] as const;
        for (const [property, propertyScore] of properties) {
          for (const value of structuredImageValues(record[property])) {
            candidates.push({
              value,
              score: typeScore + propertyScore,
              order: order++,
            });
          }
        }
      }
    } catch {
      // Invalid page metadata is ignored locally and is never uploaded.
    }
  }
  candidates.sort(
    (left, right) => right.score - left.score || left.order - right.order,
  );
  return firstResolvedHttpUrl(
    candidates.map((candidate) => candidate.value),
    effectiveUrl,
  );
}

function numericImageDimension(image: HTMLImageElement, name: "width" | "height") {
  const natural = name === "width" ? image.naturalWidth : image.naturalHeight;
  if (natural > 0) return natural;
  const attribute = Number(image.getAttribute(name));
  return Number.isFinite(attribute) && attribute > 0 ? attribute : null;
}

function bestSrcsetUrl(value: string | null) {
  if (!value) return null;
  return value
    .split(",")
    .map((candidate, order) => {
      const [url, descriptor] = candidate.trim().split(/\s+/, 2);
      const score = descriptor?.endsWith("w")
        ? Number(descriptor.slice(0, -1))
        : descriptor?.endsWith("x")
          ? Number(descriptor.slice(0, -1)) * 1_000
          : 0;
      return { url, score: Number.isFinite(score) ? score : 0, order };
    })
    .filter((candidate) => candidate.url)
    .sort((left, right) => right.score - left.score || left.order - right.order)[0]
    ?.url;
}

function documentImageUrl(document: Document, effectiveUrl: string) {
  const candidates: DocumentImageCandidate[] = [];
  let order = 0;
  for (const image of document.querySelectorAll<HTMLImageElement>("img")) {
    if (
      image.closest('[hidden], [aria-hidden="true"]') ||
      /display\s*:\s*none/i.test(image.getAttribute("style") ?? "")
    ) {
      continue;
    }
    const url = firstResolvedHttpUrl(
      [
        image.currentSrc,
        image.getAttribute("data-src"),
        image.getAttribute("data-lazy-src"),
        image.getAttribute("data-original"),
        bestSrcsetUrl(image.getAttribute("data-srcset")),
        bestSrcsetUrl(image.getAttribute("srcset")),
        image.getAttribute("src"),
      ],
      effectiveUrl,
    );
    if (!url) continue;

    const width = numericImageDimension(image, "width");
    const height = numericImageDimension(image, "height");
    if (width && height) {
      const area = width * height;
      const aspectRatio = width / height;
      if (
        width < IMAGE_RANKING.minimumWidth ||
        height < IMAGE_RANKING.minimumHeight ||
        area < IMAGE_RANKING.minimumArea ||
        aspectRatio < IMAGE_RANKING.minimumAspectRatio ||
        aspectRatio > IMAGE_RANKING.maximumAspectRatio
      ) {
        continue;
      }
    }

    const semanticText = [
      url,
      image.alt,
      image.id,
      image.className,
      image.getAttribute("role"),
    ].join(" ");
    let score = 0;
    if (image.closest("article")) score += IMAGE_RANKING.articleScore;
    if (image.closest("main")) score += IMAGE_RANKING.mainScore;
    if (image.closest("figure")) score += IMAGE_RANKING.figureScore;
    if (image.alt.trim()) score += 200;
    if (image.getAttribute("fetchpriority")?.toLowerCase() === "high") {
      score += 300;
    }
    if (width && height) {
      score += Math.min(
        Math.round((width * height) / 1_000),
        IMAGE_RANKING.maximumDimensionScore,
      );
    }
    if (LOW_QUALITY_IMAGE_MARKER.test(semanticText)) {
      score -= IMAGE_RANKING.semanticPenalty;
    }
    candidates.push({ url, score, order: order++ });
  }
  candidates.sort(
    (left, right) => right.score - left.score || left.order - right.order,
  );
  return candidates[0] &&
    candidates[0].score >= IMAGE_RANKING.minimumCandidateScore
    ? candidates[0].url
    : undefined;
}

function generalPreview(input: PreviewExtractionInput): ExtractedPagePreview {
  const { article, document, effectiveUrl } = input;
  const title =
    firstBoundedText(
      [
        metaContent(document, 'meta[property="og:title"]'),
        article?.title,
        document.title,
      ],
      BOOKMARK_CAPTURE_LIMITS.titleCodePoints,
    ) ?? new URL(effectiveUrl).hostname;
  const description = firstBoundedText(
    [
      metaContent(document, 'meta[property="og:description"]'),
      metaContent(document, 'meta[name="description"]'),
      article?.excerpt,
    ],
    BOOKMARK_CAPTURE_LIMITS.descriptionCodePoints,
  );
  const author = firstBoundedText(
    [article?.byline, metaContent(document, 'meta[name="author"]')],
    BOOKMARK_CAPTURE_LIMITS.authorCodePoints,
  );
  const siteName = boundedText(
    metaContent(document, 'meta[property="og:site_name"]'),
    BOOKMARK_CAPTURE_LIMITS.siteNameCodePoints,
  );
  const publishedAt = firstBoundedText(
    [
      article?.publishedTime,
      metaContent(document, 'meta[property="article:published_time"]'),
    ],
    BOOKMARK_CAPTURE_LIMITS.descriptionCodePoints,
  );
  const iconUrl = resolvedHttpUrl(
    document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href,
    effectiveUrl,
  );
  const thumbnailUrl =
    firstResolvedHttpUrl(
      [
        metaContent(document, 'meta[property="og:image:secure_url"]'),
        metaContent(document, 'meta[property="og:image"]'),
        metaContent(document, 'meta[name="twitter:image"]'),
      ],
      effectiveUrl,
    ) ??
    (input.inspectStructuredData
      ? structuredImageUrl(document, effectiveUrl) ??
        documentImageUrl(document, effectiveUrl)
      : undefined);

  return {
    title,
    ...(description ? { description } : {}),
    ...(author ? { author } : {}),
    ...(siteName ? { siteName } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(iconUrl ? { iconUrl } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  };
}

function useGeneralPreview(
  _input: PreviewExtractionInput,
  preview: ExtractedPagePreview,
) {
  return preview;
}

function youtubeVideoPreview(
  input: PreviewExtractionInput,
  preview: ExtractedPagePreview,
) {
  const { document } = input;
  const liveTitle = firstBoundedText(
    [
      elementTextOrContent(document, "yt-shorts-video-title-view-model h1"),
      elementTextOrContent(
        document,
        "ytd-watch-metadata h1 yt-formatted-string",
      ),
      elementTextOrContent(document, "#title h1 yt-formatted-string"),
    ],
    BOOKMARK_CAPTURE_LIMITS.titleCodePoints,
  );
  const liveAuthor = firstBoundedText(
    [
      elementTextOrContent(
        document,
        "ytd-watch-metadata ytd-channel-name a",
      ),
      elementTextOrContent(document, "#owner #channel-name a"),
      elementTextOrContent(
        document,
        '[itemprop="author"] [itemprop="name"]',
      ),
    ],
    BOOKMARK_CAPTURE_LIMITS.authorCodePoints,
  );
  const thumbnailUrl = selectBookmarkPreviewThumbnail({
    platform: "youtube",
    contentType: "video",
    contentId: input.contentId,
    observedThumbnailUrl: preview.thumbnailUrl,
  });
  return {
    ...preview,
    ...(liveTitle ? { title: liveTitle } : {}),
    ...(liveAuthor ? { author: liveAuthor } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  };
}

const PREVIEW_STRATEGIES = {
  website: {
    text: useGeneralPreview,
    video: useGeneralPreview,
  },
  youtube: {
    text: useGeneralPreview,
    video: youtubeVideoPreview,
  },
  peertube: {
    text: useGeneralPreview,
    video: useGeneralPreview,
  },
  nebula: {
    text: useGeneralPreview,
    video: useGeneralPreview,
  },
} as const satisfies Record<
  BookmarkContentPlatform,
  Record<BookmarkContentType, PreviewStrategy>
>;

export function extractPagePreview(input: PreviewExtractionInput & {
  platform: BookmarkContentPlatform;
  contentType: BookmarkContentType;
}) {
  const preview = generalPreview(input);
  return PREVIEW_STRATEGIES[input.platform][input.contentType](input, preview);
}
