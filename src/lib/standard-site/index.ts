import type { BlogPost, Release } from "content-collections";

const SORTABLE_BASE32_CHARACTERS = "234567abcdefghijklmnopqrstuvwxyz";
const TID_LENGTH = 13;

export const STANDARD_SITE = {
  documentCollection: "site.standard.document",
  publicationCollection: "site.standard.publication",
  publicationDescription:
    "Guides, release notes, and product updates for Serial, a calm and customizable RSS reader.",
  publicationName: "Serial",
  publicationUrl: "https://serial.tube",
  documentTypes: {
    guide: {
      keyPrefix: "guides",
      pathPrefix: "/guides",
      tags: ["guide"],
    },
    release: {
      keyPrefix: "",
      pathPrefix: "/releases",
      tags: ["release"],
    },
  },
} as const;

export type StandardSiteDocumentSource = {
  key: string;
  title: string;
  path: string;
  publishedAt: string;
  tags: string[];
  markdownContent: string;
  description?: string;
  updatedAt?: string;
};

function hashString(value: string) {
  let hash = 2166136261;

  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function encodeSortableBase32(value: number) {
  let remainingValue = value;
  let encodedValue = "";

  while (remainingValue) {
    const characterIndex = remainingValue % SORTABLE_BASE32_CHARACTERS.length;
    encodedValue =
      SORTABLE_BASE32_CHARACTERS.charAt(characterIndex) + encodedValue;
    remainingValue = Math.floor(
      remainingValue / SORTABLE_BASE32_CHARACTERS.length,
    );
  }

  return encodedValue;
}

function buildTid(timestampMicroseconds: number, clockId: number) {
  const timestamp = encodeSortableBase32(timestampMicroseconds);
  const clock = encodeSortableBase32(clockId).padStart(2, "2");
  const tid = `${timestamp}${clock}`;

  if (tid.length !== TID_LENGTH) {
    throw new Error(`Unable to build a valid TID from timestamp ${timestamp}.`);
  }

  return tid;
}

function buildDocumentSource(
  content: Pick<
    Release | BlogPost,
    "content" | "description" | "publish_date" | "slug" | "title"
  > & { updated_at?: string },
  documentType: (typeof STANDARD_SITE.documentTypes)[keyof typeof STANDARD_SITE.documentTypes],
): StandardSiteDocumentSource {
  const key = documentType.keyPrefix
    ? `${documentType.keyPrefix}/${content.slug}`
    : content.slug;

  return {
    key,
    title: content.title,
    path: `${documentType.pathPrefix}/${content.slug}`,
    publishedAt: `${content.publish_date}T00:00:00.000Z`,
    tags: [...documentType.tags],
    markdownContent: content.content,
    ...(content.description ? { description: content.description } : {}),
    ...(content.updated_at
      ? { updatedAt: `${content.updated_at}T00:00:00.000Z` }
      : {}),
  };
}

export function buildReleaseDocumentSource(release: Release) {
  return buildDocumentSource(release, STANDARD_SITE.documentTypes.release);
}

export function buildGuideDocumentSource(guide: BlogPost) {
  return buildDocumentSource(guide, STANDARD_SITE.documentTypes.guide);
}

export function getDocumentRkey(
  document: Pick<StandardSiteDocumentSource, "key" | "publishedAt">,
) {
  const keyHash = hashString(document.key);
  const publishedAtMilliseconds = Date.parse(document.publishedAt);
  const timestampMicroseconds =
    publishedAtMilliseconds * 1000 + (keyHash % 1_000_000);

  return buildTid(timestampMicroseconds, keyHash % 1024);
}

export function parsePublicationUri(publicationUri: string) {
  const match = publicationUri.match(
    /^at:\/\/(did:[^/]+)\/site\.standard\.publication\/([234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12})$/,
  );

  if (!match?.[1] || !match[2]) {
    throw new Error(
      "The Standard.Site publication URI must reference a site.standard.publication record with a TID record key.",
    );
  }

  return {
    did: match[1],
    rkey: match[2],
  };
}

export function buildDocumentUri(
  publicationUri: string,
  document: Pick<StandardSiteDocumentSource, "key" | "publishedAt">,
) {
  const { did } = parsePublicationUri(publicationUri);
  return `at://${did}/${STANDARD_SITE.documentCollection}/${getDocumentRkey(document)}`;
}

export function getConfiguredPublicationUri(options: {
  isMainInstance: boolean;
  publicationUri?: string;
}) {
  if (!options.isMainInstance || !options.publicationUri) return undefined;
  parsePublicationUri(options.publicationUri);
  return options.publicationUri;
}

export function buildDocumentLink(
  document: Pick<StandardSiteDocumentSource, "key" | "publishedAt">,
  options: {
    isMainInstance: boolean;
    publicationUri?: string;
  },
) {
  const publicationUri = getConfiguredPublicationUri(options);
  if (!publicationUri) return undefined;

  return {
    rel: STANDARD_SITE.documentCollection,
    href: buildDocumentUri(publicationUri, document),
  };
}

export function buildPublicationLink(options: {
  isMainInstance: boolean;
  publicationUri?: string;
}) {
  const publicationUri = getConfiguredPublicationUri(options);
  if (!publicationUri) return undefined;

  return {
    rel: STANDARD_SITE.publicationCollection,
    href: publicationUri,
  };
}

export function createPublicationVerificationResponse(options: {
  isMainInstance: boolean;
  publicationUri?: string;
}) {
  const publicationUri = getConfiguredPublicationUri(options);

  if (!publicationUri) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(publicationUri, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
