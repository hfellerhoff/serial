/* eslint-disable */
"use client";

import clsx from "clsx";
import { MaximizeIcon, MinimizeIcon, PlayIcon } from "lucide-react";
import YouTube from "react-youtube";
import { useView } from "~/app/(feed)/feed/watch/[id]/useView";
import { useFlagState } from "~/lib/hooks/useFlagState";
import { transformSecondsToFormattedTime } from "~/lib/transformSecondsToFormattedTime";
import { ButtonWithShortcut } from "../ButtonWithShortcut";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import {
  CustomVideoPlayerProvider,
  useCustomVideoPlayerContext,
} from "./CustomVideoPlayerProvider";
import { YOUTUBE_PLAYBACK_SPEEDS, YOUTUBE_PLAYER_STATES } from "./constants";
import { useVideoShortcuts } from "./useYouTubeVideoShortcuts";

interface IResponsiveVideoProps {
  videoID?: string;
  videoSrc?: string;
  isInactive: boolean;
}

function CustomVideoPlayerContent(props: IResponsiveVideoProps) {
  const {
    playerRef,
    onStateChange,
    toggleVideoPlayback,
    manualPlayerState,
    playbackSpeed,
    changeVideoPlaybackSpeed,
    videoDuration,
    isSeeking,
    videoProgress,
    seekToSecond,
    videoType,
  } = useCustomVideoPlayerContext();
  useVideoShortcuts();

  const { view, toggleView } = useView();
  const [hasInlineShortcutsVisible] = useFlagState("INLINE_SHORTCUTS");

  const player = playerRef?.current;

  const shouldShowVideoTimestamps = videoType === "video";
  const shouldShowLiveTimestamps =
    videoType === "live" && videoProgress < videoDuration;
  const shouldShowTimestamps =
    shouldShowVideoTimestamps || shouldShowLiveTimestamps;

  return (
    <div className="relative h-full w-full">
      {props.videoID && (
        <>
          <YouTube
            ref={playerRef}
            videoId={props.videoID}
            className="pointer-events-none h-full w-full select-none"
            iframeClassName="w-full h-full border-none select-none pointer-events-none"
            opts={{
              host: "https://www.youtube-nocookie.com",
              playerVars: {
                rel: 0,
                controls: 0,
                disablekb: 0,
                playsinline: 0,
              },
            }}
            onStateChange={onStateChange}
            loading="eager"
          />
          <div className="group">
            <div
              className={clsx("transition-all", {
                "opacity-0":
                  manualPlayerState === YOUTUBE_PLAYER_STATES.PLAYING ||
                  isSeeking,
              })}
            >
              <div className="absolute inset-0 h-full w-full bg-black">
                <img
                  className="h-full w-full object-contain"
                  src={`http://img.youtube.com/vi/${props.videoID}/maxresdefault.jpg`}
                />
              </div>
              <button
                onClick={toggleVideoPlayback}
                className={clsx(
                  "absolute inset-0 inset-y-8 z-20 grid place-items-center",
                  {
                    "cursor-pointer": !props.isInactive,
                    "cursor-none!": props.isInactive,
                  },
                )}
              >
                <div className="bg-background grid size-20 place-items-center rounded-2xl shadow-2xl transition-all group-hover:scale-105">
                  <PlayIcon size={32} />
                </div>
              </button>
            </div>
            <div
              className={clsx(
                "dark absolute inset-y-0 right-0 z-30 flex flex-col items-end justify-center bg-gradient-to-l from-black/50 from-70% to-transparent p-4 pl-8 text-white opacity-0 transition-opacity",
                {
                  "group-hover:opacity-100": !props.isInactive,
                  "cursor-none!": props.isInactive,
                },
              )}
            >
              <ToggleGroup
                type="single"
                value={playbackSpeed.toString()}
                onValueChange={(value) => {
                  if (!value) return;
                  const numberValue = parseFloat(value);

                  changeVideoPlaybackSpeed(numberValue);
                }}
                size="xs"
                className="flex flex-col items-center justify-center font-mono"
              >
                {YOUTUBE_PLAYBACK_SPEEDS.map((speed) => (
                  <ToggleGroupItem
                    key={speed.value}
                    value={speed.value.toString()}
                  >
                    {speed.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div
              className={clsx(
                "dark absolute inset-x-0 bottom-0 z-30 flex flex-col justify-end bg-gradient-to-t from-black/50 from-70% to-transparent p-4 pt-8 text-white opacity-0 transition-opacity",
                {
                  "group-hover:opacity-100": !props.isInactive,
                  "cursor-none!": props.isInactive,
                },
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {videoType === "live" && (
                    <Button
                      size="sm"
                      variant="link"
                      className="-ml-3 flex w-max flex-row items-center gap-2 font-mono text-sm font-bold"
                      onClick={() => {
                        const location = Math.max(
                          videoDuration + 160,
                          videoProgress,
                        );
                        player?.internalPlayer?.seekTo(location);
                      }}
                    >
                      <span className="inline-block size-2 rounded-full bg-red-600 dark:bg-red-500" />{" "}
                      {videoProgress >= videoDuration - 5 ? "Live" : "Go Live"}
                    </Button>
                  )}
                  {shouldShowTimestamps && (
                    <div className="w-max font-mono text-sm font-bold">
                      {transformSecondsToFormattedTime(videoProgress)} /{" "}
                      {transformSecondsToFormattedTime(videoDuration)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <ButtonWithShortcut
                    shortcut="f"
                    size="icon"
                    variant={
                      hasInlineShortcutsVisible === "show-shortcuts"
                        ? "outline"
                        : "ghost"
                    }
                    onClick={toggleView}
                  >
                    {view === "fullscreen" ? (
                      <MinimizeIcon size={16} />
                    ) : (
                      <MaximizeIcon size={16} />
                    )}
                  </ButtonWithShortcut>
                </div>
              </div>
              <Slider
                value={[videoProgress]}
                min={0}
                max={videoDuration}
                onValueChange={(value) => {
                  seekToSecond(value[0]!);
                }}
                className="mt-2 mr-4"
              />
            </div>
          </div>
        </>
      )}

      {props.videoSrc && (
        <video width="1600" height="900" controls>
          <source src={props.videoSrc} type="video/mp4" />
        </video>
      )}
    </div>
  );
}

export function CustomVideoPlayer(props: IResponsiveVideoProps) {
  return (
    <CustomVideoPlayerProvider>
      <CustomVideoPlayerContent {...props} />
    </CustomVideoPlayerProvider>
  );
}
