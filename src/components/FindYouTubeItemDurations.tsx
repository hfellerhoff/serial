"use client";

import { useEffect, useRef } from "react";
import CreateYouTubePlayer from "youtube-player";
import { type YouTubePlayer } from "youtube-player/dist/types";
import { useFeed } from "~/lib/data/FeedProvider";

const PLAYER_ID = "find-youtube-item-durations";

export function FindYouTubeItemDurations() {
  const { allItems } = useFeed();
  const index = useRef(0);
  const player = useRef<YouTubePlayer | null>(null);
  const durationMap = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!allItems.length) return;

    const item = allItems[0];
    const player = CreateYouTubePlayer(`duration-player`);
    console.log(player);
    console.log(item);

    player.on("stateChange", (event) => {
      const duration = event.target?.playerInfo?.duration;
      console.log("duration", item.contentId, duration);
      if (duration) {
        durationMap.current[item.contentId] = duration;
        console.log("duration", item.contentId, duration);
      }
    });
  }, [allItems]);

  return (
    <>
      <div id={`duration-player`} className="hidden" />
    </>
  );
}
