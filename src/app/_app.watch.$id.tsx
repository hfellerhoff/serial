"use client";

import { createFileRoute } from "@tanstack/react-router";
import clsx from "clsx";
import { useEffect } from "react";
import { useView } from "~/components/feed/watch/[id]/useView";
import { useZoom } from "~/components/feed/watch/[id]/useZoom";
import { VideoDisplay } from "~/components/feed/watch/[id]/VideoDisplay";
import useIsInactive from "~/lib/hooks/useIsInactive";

export const Route = createFileRoute("/_app/watch/$id")({
  component: WatchVideoPage,
});

function WatchVideoPage() {
  const params = Route.useParams();

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
