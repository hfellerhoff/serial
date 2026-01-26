import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { YOUTUBE_FASTEST_SPEED, YOUTUBE_PLAYBACK_SPEEDS } from "./constants";
import { useCustomVideoPlayerContext } from "./CustomVideoPlayerProvider";
import { useView } from "~/components/feed/watch/[id]/useView";
import { doesAnyFormElementHaveFocus } from "~/lib/doesAnyFormElementHaveFocus";

const SEEK_KEYS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function useVideoShortcuts() {
  const {
    toggleVideoPlayback,
    playerState,
    playbackSpeed,
    changeVideoPlaybackSpeed,
    videoDuration,
    seekToSecond,
    videoProgress,
    captionsAvailable,
    captionsModuleLoaded,
    toggleCaptions,
    toggleNativeFullscreen,
    isNativeFullscreen,
    toggleMute,
  } = useCustomVideoPlayerContext();

  const { view, setView, toggleView } = useView();

  const keypressTimeRef = useRef<Record<string, number | null>>({});

  useEffect(() => {
    const processKeyDown = (event: KeyboardEvent) => {
      if (typeof keypressTimeRef.current[event.key] === "number") {
        return;
      }

      keypressTimeRef.current[event.key] = Date.now();
    };

    const processKeyUp = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (doesAnyFormElementHaveFocus()) return;

      keypressTimeRef.current[event.key] = null;

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
      if (event.key === "c") {
        event.preventDefault();
        if (!captionsModuleLoaded) {
          toast.error("Play video to load available captions");
          return;
        }
        if (!captionsAvailable) {
          toast.error("Captions not available for this video");
          return;
        }
        toggleCaptions();
        return;
      }
      if (event.key === "m") {
        event.preventDefault();
        toggleMute();
        return;
      }
      // Shift+F or ` for windowed fullscreen
      if ((event.key === "F" && event.shiftKey) || event.key === "`") {
        event.preventDefault();
        // If in native fullscreen, exit it and enter windowed fullscreen
        if (isNativeFullscreen) {
          document.exitFullscreen();
          setView("fullscreen");
        } else {
          toggleView();
        }
        return;
      }
      // f for true/native fullscreen
      if (event.key === "f" && !event.shiftKey) {
        event.preventDefault();
        // Exit windowed fullscreen if active before entering native fullscreen
        if (view === "fullscreen") {
          setView("windowed");
        }
        toggleNativeFullscreen();
        return;
      }
    };

    window.addEventListener("keydown", processKeyDown);
    window.addEventListener("keyup", processKeyUp);

    return () => {
      window.removeEventListener("keydown", processKeyDown);
      window.removeEventListener("keyup", processKeyUp);
    };
  }, [
    playerState,
    toggleVideoPlayback,
    playbackSpeed,
    videoProgress,
    changeVideoPlaybackSpeed,
    seekToSecond,
    videoDuration,
    captionsModuleLoaded,
    captionsAvailable,
    toggleCaptions,
    toggleNativeFullscreen,
    isNativeFullscreen,
    view,
    setView,
    toggleView,
    toggleMute,
  ]);
}
