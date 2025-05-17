const SEEK_KEYS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

import { useEffect } from "react";
import { doesAnyFormElementHaveFocus } from "~/lib/doesAnyFormElementHaveFocus";
import { YOUTUBE_FASTEST_SPEED, YOUTUBE_PLAYBACK_SPEEDS } from "./constants";
import { useCustomVideoPlayerContext } from "./CustomVideoPlayerProvider";

export function useVideoShortcuts() {
  const {
    toggleVideoPlayback,
    playerState,
    playbackSpeed,
    changeVideoPlaybackSpeed,
    videoDuration,
    seekToSecond,
    videoProgress,
  } = useCustomVideoPlayerContext();

  useEffect(() => {
    const processKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (doesAnyFormElementHaveFocus()) return;

      if (event.key === " ") {
        event.preventDefault();
        toggleVideoPlayback();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekToSecond(videoProgress - 5 * playbackSpeed);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        seekToSecond(videoProgress + 5 * playbackSpeed);
        toggleVideoPlayback();
        return;
      }
      if (SEEK_KEYS.includes(event.key)) {
        event.preventDefault();
        const chunks = videoDuration / 10;
        seekToSecond(chunks * parseInt(event.key));
        return;
      }
      if (event.key === "<" && event.shiftKey) {
        event.preventDefault();
        const currentSpeedIndex = YOUTUBE_PLAYBACK_SPEEDS.findIndex(
          (speed) => speed.value === playbackSpeed,
        );
        if (currentSpeedIndex <= 0) return;
        changeVideoPlaybackSpeed(
          YOUTUBE_PLAYBACK_SPEEDS[currentSpeedIndex - 1]!.value,
        );
        return;
      }
      if (event.key === ">" && event.shiftKey) {
        event.preventDefault();
        const currentSpeedIndex = YOUTUBE_PLAYBACK_SPEEDS.findIndex(
          (speed) => speed.value === playbackSpeed,
        );
        if (playbackSpeed >= YOUTUBE_FASTEST_SPEED) return;
        changeVideoPlaybackSpeed(
          YOUTUBE_PLAYBACK_SPEEDS[currentSpeedIndex + 1]!.value,
        );
        return;
      }
    };
    window.addEventListener("keydown", processKey);

    return () => {
      window.removeEventListener("keydown", processKey);
    };
  }, [
    playerState,
    toggleVideoPlayback,
    playbackSpeed,
    videoProgress,
    changeVideoPlaybackSpeed,
    seekToSecond,
    videoDuration,
  ]);
}
