"use client";

import classes from "./ResponsiveVideo.module.css";

interface IResponsiveVideoProps {
  videoID?: string;
  videoSrc?: string;
}

export default function ResponsiveVideo(props: IResponsiveVideoProps) {
  return (
    <div className={classes.video}>
      <div
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
