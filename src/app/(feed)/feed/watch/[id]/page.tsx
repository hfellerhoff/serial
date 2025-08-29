"use client";

import clsx from "clsx";
import { use, useEffect } from "react";
import useIsInactive from "~/lib/hooks/useIsInactive";
import { useView } from "./useView";
import { useZoom } from "./useZoom";
import { VideoDisplay } from "./VideoDisplay";

export default function WatchVideoPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = use(props.params);

  const { view } = useView();
  const { zoom } = useZoom();

  const isInactive = useIsInactive();

  useEffect(() => {
    if (isInactive) {
      document.body.classList.add("no-cursor");
    } else {
      document.body.classList.remove("no-cursor");
    }

    return () => {
      document.body.classList.remove("no-cursor");
    };
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
        "max-w-7xl": view === "windowed" && zoom === 6,
      })}
    >
      <div
        className={clsx("h-full w-full", {
          "sm:py-6": view === "windowed",
        })}
      >
        <VideoDisplay id={params.id} isInactive={isInactive} />
      </div>
    </div>
  );
}
