"use client";

import { useFlagState } from "~/lib/hooks/useFlagState";
import classes from "./ResponsiveVideo.module.css";
import clsx from "clsx";
import { useRef } from "react";
import { CustomVideoPlayer } from "./CustomVideoPlayer";
import { useFeedItemGlobalState } from "~/lib/data/atoms";

interface IResponsiveVideoProps {
  videoID?: string;
  videoSrc?: string;
  isInactive: boolean;
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
      className="border-none"
      onMouseMove={() => {
        props.containerRef?.current?.focus();
      }}
    />
  );
}

function PeerTubeEmbed(props: IEmbedProps) {
  return (
    <iframe
      width="1600"
      height="900"
      src={`https://digitalcourage.video/videos/embed/${props.videoID}`}
      title="YouTube video player"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      className="border-none"
      onMouseMove={() => {
        props.containerRef?.current?.focus();
      }}
      sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
    />
  );
}

export default function ResponsiveVideo(props: IResponsiveVideoProps) {
  const containerRef = useRef<null | HTMLDivElement>(null);
  const [videoPlayer] = useFlagState("CUSTOM_VIDEO_PLAYER");

  const [feedItem] = useFeedItemGlobalState(props?.videoID ?? "");

  if (videoPlayer === "serial" && feedItem.platform === "youtube") {
    return <CustomVideoPlayer {...props} />;
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
          "--aspect-ratio": "16/9",
        }}
      >
        {props.videoID && (
          <>
            {feedItem.platform === "youtube" && (
              <YouTubeEmbed {...props} containerRef={containerRef} />
            )}
            {feedItem.platform === "peertube" && (
              <PeerTubeEmbed {...props} containerRef={containerRef} />
            )}
          </>
        )}
        {props.videoSrc && (
          <video width="1600" height="900" controls>
            <source src={props.videoSrc} type="video/mp4" />
          </video>
        )}
      </div>
    </div>
  );
}
