import { CONTENT_PLATFORM, CONTENT_TYPE } from "./descriptor";
import type {
  ContentDescriptor,
  ContentPlatform,
  ContentType,
} from "./descriptor";

export type NativeOpeningBehavior = "reader" | "player" | "origin";

export type ContentCapability = {
  nativeOpening: NativeOpeningBehavior;
  pageCapture: "allowed" | "disallowed";
  originActionLabel: string;
};

export const CONTENT_CAPABILITIES = {
  [CONTENT_PLATFORM.WEBSITE]: {
    [CONTENT_TYPE.TEXT]: {
      nativeOpening: "reader",
      pageCapture: "allowed",
      originActionLabel: "Open in Website",
    },
    [CONTENT_TYPE.VIDEO]: {
      nativeOpening: "origin",
      pageCapture: "disallowed",
      originActionLabel: "Open in Website",
    },
  },
  [CONTENT_PLATFORM.YOUTUBE]: {
    [CONTENT_TYPE.TEXT]: {
      nativeOpening: "origin",
      pageCapture: "disallowed",
      originActionLabel: "View on YouTube",
    },
    [CONTENT_TYPE.VIDEO]: {
      nativeOpening: "player",
      pageCapture: "disallowed",
      originActionLabel: "View on YouTube",
    },
  },
  [CONTENT_PLATFORM.PEERTUBE]: {
    [CONTENT_TYPE.TEXT]: {
      nativeOpening: "origin",
      pageCapture: "disallowed",
      originActionLabel: "View on PeerTube",
    },
    [CONTENT_TYPE.VIDEO]: {
      nativeOpening: "player",
      pageCapture: "disallowed",
      originActionLabel: "View on PeerTube",
    },
  },
  [CONTENT_PLATFORM.NEBULA]: {
    [CONTENT_TYPE.TEXT]: {
      nativeOpening: "origin",
      pageCapture: "disallowed",
      originActionLabel: "View on Nebula",
    },
    [CONTENT_TYPE.VIDEO]: {
      nativeOpening: "origin",
      pageCapture: "disallowed",
      originActionLabel: "View on Nebula",
    },
  },
} as const satisfies Record<
  ContentPlatform,
  Record<ContentType, ContentCapability>
>;

export function getContentCapability(
  descriptor: Pick<ContentDescriptor, "platform" | "contentType">,
): ContentCapability {
  return CONTENT_CAPABILITIES[descriptor.platform][descriptor.contentType];
}

export function canRetainPageCapture(
  descriptor: Pick<ContentDescriptor, "platform" | "contentType">,
) {
  return getContentCapability(descriptor).pageCapture === "allowed";
}

export function getNativeOpeningBehavior(
  descriptor: Pick<ContentDescriptor, "platform" | "contentType">,
) {
  return getContentCapability(descriptor).nativeOpening;
}

export function getOriginActionLabel(
  descriptor: Pick<ContentDescriptor, "platform" | "contentType">,
) {
  return getContentCapability(descriptor).originActionLabel;
}
