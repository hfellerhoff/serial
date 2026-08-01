"use client";

import clsx from "clsx";
import { useRef } from "react";
import { CustomVideoPlayer } from "./CustomVideoPlayer";
import classes from "./ResponsiveVideo.module.css";
import type React from "react";
import type {
  ContentPlatform,
  VideoOrientation,
} from "~/lib/content/descriptor";
import { useFlagState } from "~/lib/hooks/useFlagState";
import { useFeedItemValue } from "~/lib/data/store";
import { useBookmarkValue } from "~/lib/data/bookmarks";
import { effectiveVideoOrientation } from "~/lib/content/descriptor";

interface IResponsiveVideoProps {
  videoID?: string;
  feedItemId?: string;
  bookmarkId?: string;
  videoSrc?: string;
  isInactive: boolean;
  platform?: ContentPlatform;
  orientation?: VideoOrientation | null;
  originalUrl?: string;
}

interface IEmbedProps extends IResponsiveVideoProps {
  containerRef: React.RefObject<null | HTMLDivElement>;
}

function YouTubeEmbed(props: IEmbedProps) {
  return (
    <iframe
      width="1600"
      height="900"
      src={`https://www.youtube-nocookie.com/embed/${props.videoID}`}
      title="YouTube video player"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      className="border-none"
      onMouseMove={() => {
        props.containerRef.current?.focus();
      }}
    />
  );
}

function PeerTubeEmbed(
  props: IEmbedProps & { origin: string; providerVideoId: string },
) {
  return (
    <>
      <iframe
        width="1600"
        height="900"
        src={`${props.origin}/videos/embed/${props.providerVideoId}`}
        title="PeerTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="border-none"
        onMouseMove={() => {
          props.containerRef.current?.focus();
        }}
        sandbox="allow-scripts allow-popups allow-forms"
      />
    </>
  );
}

export default function ResponsiveVideo(props: IResponsiveVideoProps) {
  const containerRef = useRef<null | HTMLDivElement>(null);
  const [videoPlayer] = useFlagState("CUSTOM_VIDEO_PLAYER");

  const feedItem = useFeedItemValue(props.feedItemId ?? "");
  const bookmark = useBookmarkValue(props.bookmarkId ?? "");
  const orientation = effectiveVideoOrientation(
    props.orientation ?? feedItem?.orientation ?? bookmark?.orientation ?? null,
  );
  const isVertical = orientation === "vertical";

  const platform = props.platform ?? feedItem?.platform ?? bookmark?.platform;
  const peerTubeSeparator = props.videoID?.lastIndexOf("|") ?? -1;
  const peerTubeIdentity =
    platform === "peertube" && props.videoID && peerTubeSeparator > 0
      ? {
          origin: props.videoID.slice(0, peerTubeSeparator),
          providerVideoId: props.videoID.slice(peerTubeSeparator + 1),
        }
      : null;

  if (videoPlayer === "serial" && platform === "youtube") {
    return <CustomVideoPlayer {...props} orientation={orientation} />;
  }

  return (
    <div
      ref={containerRef}
      className={clsx("relative h-full w-full", classes.video)}
    >
      <div
        className="h-full w-full"
        style={{
          // @ts-expect-error need this
          "--aspect-ratio": isVertical ? "9/16" : "16/9",
        }}
      >
        {props.videoID && (
          <>
            {platform === "youtube" && (
              <YouTubeEmbed {...props} containerRef={containerRef} />
            )}
            {peerTubeIdentity && (
              <PeerTubeEmbed
                {...props}
                containerRef={containerRef}
                origin={peerTubeIdentity.origin}
                providerVideoId={peerTubeIdentity.providerVideoId}
              />
            )}
          </>
        )}
        {props.videoSrc && (
          <video width="1600" height="900" controls>
            <source src={props.videoSrc} type="video/mp4" />
            <track kind="captions" />
          </video>
        )}
      </div>
    </div>
  );
}
