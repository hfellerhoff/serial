export type BookmarkContentPlatform =
  "website" | "youtube" | "peertube" | "nebula";

export type BookmarkContentType = "text" | "video";

export type BookmarkContentDescriptor = {
  platform: BookmarkContentPlatform;
  contentType: BookmarkContentType;
};

export type NativeOpeningBehavior = "reader" | "player" | "origin";

export type ContentCapability = {
  nativeOpening: NativeOpeningBehavior;
  pageCapture: "allowed" | "disallowed";
  originActionLabel: string;
};

export const CONTENT_CAPABILITIES = {
  website: {
    text: {
      nativeOpening: "reader",
      pageCapture: "allowed",
      originActionLabel: "Open in Website",
    },
    video: {
      nativeOpening: "origin",
      pageCapture: "disallowed",
      originActionLabel: "Open in Website",
    },
  },
  youtube: {
    text: {
      nativeOpening: "origin",
      pageCapture: "disallowed",
      originActionLabel: "View on YouTube",
    },
    video: {
      nativeOpening: "player",
      pageCapture: "disallowed",
      originActionLabel: "View on YouTube",
    },
  },
  peertube: {
    text: {
      nativeOpening: "origin",
      pageCapture: "disallowed",
      originActionLabel: "View on PeerTube",
    },
    video: {
      nativeOpening: "player",
      pageCapture: "disallowed",
      originActionLabel: "View on PeerTube",
    },
  },
  nebula: {
    text: {
      nativeOpening: "origin",
      pageCapture: "disallowed",
      originActionLabel: "View on Nebula",
    },
    video: {
      nativeOpening: "origin",
      pageCapture: "disallowed",
      originActionLabel: "View on Nebula",
    },
  },
} as const satisfies Record<
  BookmarkContentPlatform,
  Record<BookmarkContentType, ContentCapability>
>;

export function getContentCapability(
  descriptor: BookmarkContentDescriptor,
): ContentCapability {
  return CONTENT_CAPABILITIES[descriptor.platform][descriptor.contentType];
}
