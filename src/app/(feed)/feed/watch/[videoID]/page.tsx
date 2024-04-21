"use client";

import clsx from "clsx";
import React from "react";
import { FeedContext, useKeyboard } from "~/components/KeyboardProvider";
import { VideoDisplay } from "./VideoDisplay";

export default function WatchVideoPage({
  params,
}: {
  params: { videoID: string };
}) {
  const { view, zoom } = useKeyboard();

  console.log(zoom);

  return (
    <div
      className={clsx("mx-auto grid h-full w-full place-items-center", {
        "absolute inset-0 z-30 bg-background": view === "fullscreen",
        "max-w-xl": view === "windowed" && zoom === 0,
        "max-w-2xl": view === "windowed" && zoom === 1,
        "max-w-3xl": view === "windowed" && zoom === 2,
        "max-w-4xl": view === "windowed" && zoom === 3,
        "max-w-5xl": view === "windowed" && zoom === 4,
        "max-w-6xl": view === "windowed" && zoom === 5,
      })}
    >
      <div
        className={clsx("w-full", {
          "sm:py-6": view === "windowed",
        })}
      >
        <VideoDisplay id={params.videoID} />
      </div>
    </div>
  );
}
