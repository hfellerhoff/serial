"use client";

import createDOMPurify from "dompurify";
import parse, { Element } from "html-react-parser";
import { useEffect, useState } from "react";
import type { HTMLReactParserOptions } from "html-react-parser";
import { CustomVideoPlayer } from "~/components/CustomVideoPlayer";
import { ArticleImageLightbox } from "~/components/feed/read/ArticleImageLightbox";
import { useFlagState } from "~/lib/hooks/useFlagState";
import {
  BOOKMARK_CAPTURE_ALLOWED_ATTRIBUTES,
  BOOKMARK_CAPTURE_ALLOWED_TAGS,
} from "~/server/bookmarks/sanitizePolicy";

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function BookmarkArticleContent({ content }: { content: string }) {
  const [sanitizedContent, setSanitizedContent] = useState("");
  const [videoPlayer] = useFlagState("CUSTOM_VIDEO_PLAYER");

  useEffect(() => {
    const purifier = createDOMPurify(window);
    const frame = window.requestAnimationFrame(() => {
      setSanitizedContent(
        purifier.sanitize(content, {
          ALLOWED_TAGS: [...BOOKMARK_CAPTURE_ALLOWED_TAGS],
          ALLOWED_ATTR: [...BOOKMARK_CAPTURE_ALLOWED_ATTRIBUTES],
          ALLOW_DATA_ATTR: false,
          ALLOW_ARIA_ATTR: false,
        }),
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [content]);

  if (!sanitizedContent) {
    return <p role="status">Preparing Page capture…</p>;
  }

  const options: HTMLReactParserOptions = {
    replace: (node) => {
      if (!(node instanceof Element)) return;
      if (node.name === "a" && node.attribs.href?.startsWith("http")) {
        node.attribs.target = "_blank";
        node.attribs.rel = "noopener noreferrer";
      }
      if (node.name === "img") {
        const src = node.attribs.src;
        if (!src) return <></>;
        return (
          <ArticleImageLightbox
            src={src}
            alt={node.attribs.alt ?? ""}
            protectedRemote
          />
        );
      }
      if (node.attribs["data-serial-embed"] !== "youtube") return;
      const videoId = node.attribs["data-video-id"];
      if (!videoId || !YOUTUBE_VIDEO_ID.test(videoId)) return <></>;
      const start = node.attribs["data-start"];
      const validStart = start && /^\d+$/.test(start) ? start : null;

      if (videoPlayer === "serial") {
        return (
          <div
            data-article-video-embed
            className="aspect-video w-full overflow-hidden rounded"
          >
            <CustomVideoPlayer
              videoID={videoId}
              orientation="horizontal"
              isInactive={false}
              isEmbed
            />
          </div>
        );
      }
      return (
        <div
          data-article-video-embed
          className="aspect-video w-full overflow-hidden rounded"
        >
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}${validStart ? `?start=${validStart}` : ""}`}
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-presentation"
            className="h-full w-full border-none"
          />
        </div>
      );
    },
  };

  return <>{parse(sanitizedContent, options)}</>;
}
