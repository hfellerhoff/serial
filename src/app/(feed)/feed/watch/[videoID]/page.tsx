"use client";

import clsx from "clsx";
import React, { use, useEffect } from "react";
import { useKeyboard } from "~/components/KeyboardProvider";
import { VideoDisplay } from "./VideoDisplay";
import useIsInactive from "~/lib/hooks/useIsInactive";

export default function WatchVideoPage(props: {
  params: Promise<{ videoID: string }>;
}) {
  const params = use(props.params);
  const { view, zoom } = useKeyboard();

  const isInactive = useIsInactive();

  useEffect(() => {
    if (isInactive) {
      document.body.classList.add("no-cursor");
    } else {
      document.body.classList.remove("no-cursor");
    }
  }, [isInactive]);

  return (
    <div
      className={clsx("mx-auto grid h-full w-full place-items-center", {
        "bg-background absolute inset-0 z-30": view === "fullscreen",
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
        <VideoDisplay id={params.videoID} isInactive={isInactive} />
      </div>
    </div>
  );
}
