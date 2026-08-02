import type {
  BookmarkContentPlatform,
  BookmarkContentType,
} from "./capabilities";

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeThumbnailUrl(contentId: string | null) {
  return contentId && YOUTUBE_VIDEO_ID.test(contentId)
    ? `https://i.ytimg.com/vi/${contentId}/hqdefault.jpg`
    : null;
}

export function selectBookmarkPreviewThumbnail(input: {
  platform: BookmarkContentPlatform;
  contentType: BookmarkContentType;
  contentId: string | null;
  observedThumbnailUrl?: string | null;
}) {
  if (input.platform !== "youtube" || input.contentType !== "video") {
    return input.observedThumbnailUrl;
  }
  return youtubeThumbnailUrl(input.contentId) ?? input.observedThumbnailUrl;
}
