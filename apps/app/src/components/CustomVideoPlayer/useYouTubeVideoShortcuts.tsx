import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { YOUTUBE_FASTEST_SPEED, YOUTUBE_PLAYBACK_SPEEDS } from "./constants";
import { useCustomVideoPlayerContext } from "./CustomVideoPlayerProvider";
import { useView } from "~/components/feed/watch/[id]/useView";
import { doesAnyFormElementHaveFocus } from "~/lib/doesAnyFormElementHaveFocus";
import { getShortcutEventKey } from "~/lib/getShortcutEventKey";

const SEEK_KEYS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function useVideoShortcuts({ disabled = false } = {}) {
  const {
    toggleVideoPlayback,
    playerState,
    playbackSpeed,
    changeVideoPlaybackSpeed,
    videoDuration,
    seekToSecond,
    videoProgress,
    captionsModuleLoaded,
    toggleCaptions,
    toggleNativeFullscreen,
    isNativeFullscreen,
    toggleMute,
  } = useCustomVideoPlayerContext();

  const { view, setView, toggleView } = useView();

  const keypressTimeRef = useRef<Record<string, number | null>>({});

  useEffect(() => {
    if (disabled) return;

    const processKeyDown = (event: KeyboardEvent) => {
      // Track by the normalized key so pressing Option mid-hold cannot
      // strand an entry under the composed character
      const key = getShortcutEventKey(event);
      if (typeof keypressTimeRef.current[key] === "number") {
        return;
      }

      keypressTimeRef.current[key] = Date.now();
    };

    const processKeyUp = (event: KeyboardEvent) => {
      // Alt only peeks at the shortcut hints, so it never disqualifies a
      // shortcut
      if (event.metaKey || event.ctrlKey) {
        return;
      }
      if (doesAnyFormElementHaveFocus()) return;

      const key = getShortcutEventKey(event);

      keypressTimeRef.current[key] = null;

      if (key === " ") {
        event.preventDefault();
        toggleVideoPlayback();
        return;
      }
      if (key === "ArrowLeft") {
        event.preventDefault();
        seekToSecond(videoProgress - 5 * playbackSpeed);
        return;
      }
      if (key === "ArrowRight") {
        event.preventDefault();
        seekToSecond(videoProgress + 5 * playbackSpeed);
        toggleVideoPlayback();
        return;
      }
      if (SEEK_KEYS.includes(key)) {
        event.preventDefault();
        const chunks = videoDuration / 10;
        seekToSecond(chunks * parseInt(key));
        return;
      }
      if (key === "<" && event.shiftKey) {
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
      if (key === ">" && event.shiftKey) {
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
      if (key === "c") {
        event.preventDefault();
        if (!captionsModuleLoaded) {
          toast.error("Play video to load available captions");
          return;
        }
        toggleCaptions();
        return;
      }
      if (key === "m") {
        event.preventDefault();
        toggleMute();
        return;
      }
      // Shift+F or ` for windowed fullscreen
      if ((key === "F" && event.shiftKey) || key === "`") {
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
      if (key === "f" && !event.shiftKey) {
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
    toggleCaptions,
    toggleNativeFullscreen,
    isNativeFullscreen,
    view,
    setView,
    toggleView,
    toggleMute,
    disabled,
  ]);
}
