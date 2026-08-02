import {
  CONTENT_CAPABILITIES,
  getContentCapability as getSharedContentCapability,
} from "@serial/bookmark-capture";
import type {
  ContentCapability,
  NativeOpeningBehavior,
} from "@serial/bookmark-capture";
import type { ContentDescriptor } from "./descriptor";

export { CONTENT_CAPABILITIES };
export type { ContentCapability, NativeOpeningBehavior };

export function getContentCapability(
  descriptor: Pick<ContentDescriptor, "platform" | "contentType">,
): ContentCapability {
  return getSharedContentCapability(descriptor);
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
