"use client";

import parse, { Element } from "html-react-parser";
import type { HTMLReactParserOptions } from "html-react-parser";
import { CustomVideoPlayer } from "~/components/CustomVideoPlayer";
import { useFlagState } from "~/lib/hooks/useFlagState";
import classes from "~/components/feed/read/article.module.css";

function extractYouTubeVideoId(src: string): string | null {
  const match = src.match(
    /(?:youtube\.com|youtube-nocookie\.com)\/embed\/([^?/]+)/,
  );
  return match?.[1] ?? null;
}

export function ArticleContent({ content }: { content: string }) {
  const [videoPlayer] = useFlagState("CUSTOM_VIDEO_PLAYER");

  const options: HTMLReactParserOptions = {
    replace: (domNode) => {
      if (!(domNode instanceof Element) || domNode.name !== "iframe") return;

      const src = domNode.attribs.src ?? "";
      const videoId = extractYouTubeVideoId(src);
      if (!videoId) return;

      if (videoPlayer === "serial") {
        return (
          <div
            className={`${classes.videoEmbed} my-4 aspect-video w-full overflow-hidden rounded`}
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
        <div className="my-4 aspect-video w-full overflow-hidden rounded">
          <iframe
            width="1600"
            height="900"
            src={`https://www.youtube-nocookie.com/embed/${videoId}`}
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full border-none"
          />
        </div>
      );
    },
  };

  return <>{parse(content, options)}</>;
}
