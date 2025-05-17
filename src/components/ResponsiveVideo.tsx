"use client";

import { useFlagState } from "~/lib/hooks/useFlagState";
import classes from "./ResponsiveVideo.module.css";
import clsx from "clsx";
import { useRef } from "react";
import { CustomVideoPlayer } from "./CustomVideoPlayer";

interface IResponsiveVideoProps {
  videoID?: string;
  videoSrc?: string;
  isInactive: boolean;
}

export default function ResponsiveVideo(props: IResponsiveVideoProps) {
  const containerRef = useRef<null | HTMLDivElement>(null);
  const [videoPlayer] = useFlagState("CUSTOM_VIDEO_PLAYER");

  if (videoPlayer === "serial") {
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
          <iframe
            width="1600"
            height="900"
            src={`https://www.youtube-nocookie.com/embed/${props.videoID}`}
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="border-none"
            onMouseMove={() => {
              containerRef.current?.focus();
            }}
          />
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
