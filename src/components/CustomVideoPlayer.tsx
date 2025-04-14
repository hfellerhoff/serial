/* eslint-disable */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import classes from "./ResponsiveVideo.module.css";
import YouTube from "react-youtube";
import { YOUTUBE_PLAYER_STATES } from "./youtube";
import clsx from "clsx";
import { PlayIcon } from "lucide-react";
import { Slider } from "./ui/slider";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { transformSecondsToFormattedTime } from "~/lib/transformSecondsToFormattedTime";

const PLAYBACK_SPEEDS = [
  {
    label: "0.50x",
    value: 0.5,
  },
  {
    label: "0.75x",
    value: 0.75,
  },
  {
    label: "1.00x",
    value: 1,
  },
  {
    label: "1.25x",
    value: 1.25,
  },
  {
    label: "1.50x",
    value: 1.5,
  },
  {
    label: "1.75x",
    value: 1.75,
  },
  {
    label: "2.00x",
    value: 2,
  },
];
const FASTEST_SPEED = PLAYBACK_SPEEDS[PLAYBACK_SPEEDS.length - 1]!.value;

const SEEK_KEYS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

function useVideoShortcuts() {
  const playerRef = useRef<YouTube | null>(null);
  const [playerState, setPlayerState] = useState<number>(
    YOUTUBE_PLAYER_STATES.BUFFERING,
  );
  const [manualPlayerState, setManualPlayerState] = useState(playerState);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  const changeVideoPlaybackSpeed = useCallback((speed: number) => {
    if (!playerRef?.current) return;
    const player = playerRef?.current as YouTube | null;

    setPlaybackSpeed(speed);
    void player?.internalPlayer?.setPlaybackRate(speed);
  }, []);

  const toggleVideoPlayback = useCallback(() => {
    if (!playerRef?.current) return;
    const player = playerRef?.current as YouTube | null;

    if (
      playerState === YOUTUBE_PLAYER_STATES.BUFFERING ||
      playerState === YOUTUBE_PLAYER_STATES.CUED ||
      playerState === YOUTUBE_PLAYER_STATES.PAUSED ||
      playerState === YOUTUBE_PLAYER_STATES.ENDED
    ) {
      void player?.internalPlayer?.playVideo();
      return;
    }

    if (playerState === YOUTUBE_PLAYER_STATES.PLAYING) {
      setManualPlayerState(YOUTUBE_PLAYER_STATES.PAUSED);

      setTimeout(() => {
        void player?.internalPlayer?.pauseVideo();
      }, 100);
      return;
    }
  }, [playerState, setManualPlayerState]);

  const seekToSecond = useCallback(
    (seconds: number) => {
      if (!playerRef?.current) return;
      const player = playerRef?.current as YouTube | null;
      void player?.internalPlayer.seekTo(seconds);
      setVideoProgress(seconds);
      setIsSeeking(true);
      if (playerState !== YOUTUBE_PLAYER_STATES.PLAYING) {
        toggleVideoPlayback();
      }
    },
    [playerState],
  );

  useEffect(() => {
    const processKey = async (event: KeyboardEvent) => {
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
        const currentSpeedIndex = PLAYBACK_SPEEDS.findIndex(
          (speed) => speed.value === playbackSpeed,
        );
        if (currentSpeedIndex <= 0) return;
        changeVideoPlaybackSpeed(PLAYBACK_SPEEDS[currentSpeedIndex - 1]!.value);
        return;
      }
      if (event.key === ">" && event.shiftKey) {
        event.preventDefault();
        const currentSpeedIndex = PLAYBACK_SPEEDS.findIndex(
          (speed) => speed.value === playbackSpeed,
        );
        if (playbackSpeed >= FASTEST_SPEED) return;
        changeVideoPlaybackSpeed(PLAYBACK_SPEEDS[currentSpeedIndex + 1]!.value);
        return;
      }
    };
    window.addEventListener("keydown", processKey);

    return () => {
      window.removeEventListener("keydown", processKey);
    };
  }, [playerState, toggleVideoPlayback, playbackSpeed, videoProgress]);

  return {
    playerRef,
    toggleVideoPlayback,
    manualPlayerState,
    setManualPlayerState,
    playerState,
    setPlayerState,
    playbackSpeed,
    changeVideoPlaybackSpeed,
    videoDuration,
    setVideoDuration,
    isSeeking,
    setIsSeeking,
    videoProgress,
    setVideoProgress,
  };
}

interface IResponsiveVideoProps {
  videoID?: string;
  videoSrc?: string;
  isInactive: boolean;
}

export default function CustomVideoPlayer(props: IResponsiveVideoProps) {
  const {
    playerRef,
    toggleVideoPlayback,
    manualPlayerState,
    setManualPlayerState,
    playerState,
    setPlayerState,
    playbackSpeed,
    changeVideoPlaybackSpeed,
    videoDuration,
    setVideoDuration,
    isSeeking,
    setIsSeeking,
    videoProgress,
    setVideoProgress,
  } = useVideoShortcuts();

  const videoProgressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    const player = playerRef?.current as YouTube | null;

    const updateTime = async () => {
      const time = await player?.internalPlayer?.getCurrentTime();
      setVideoProgress(time || 0);
    };

    if (playerState === YOUTUBE_PLAYER_STATES.PLAYING) {
      videoProgressIntervalRef.current = setInterval(updateTime, 250);
    } else if (videoProgressIntervalRef.current) {
      clearInterval(videoProgressIntervalRef.current);
    }
  }, [playerState]);

  const player = playerRef?.current as YouTube | null;

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
            onStateChange={(event) => {
              setVideoDuration(event.target.getDuration());
              setVideoProgress(event.target.getCurrentTime());
              setPlayerState(event.data);

              if (event.data === YOUTUBE_PLAYER_STATES.PLAYING) {
                setTimeout(() => {
                  setManualPlayerState(event.data);
                  setIsSeeking(false);
                }, 50);
              } else {
                setManualPlayerState(event.data);
              }
            }}
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
                "from-background absolute inset-y-0 right-0 z-30 flex flex-col items-center justify-center bg-gradient-to-l to-transparent p-4 pl-8 opacity-0 transition-opacity",
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
                {PLAYBACK_SPEEDS.map((speed) => (
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
                "from-background absolute inset-x-0 bottom-0 z-30 flex flex-col bg-gradient-to-t to-transparent p-4 pt-8 opacity-0 transition-opacity",
                {
                  "group-hover:opacity-100": !props.isInactive,
                  "cursor-none!": props.isInactive,
                },
              )}
            >
              <Slider
                value={[videoProgress]}
                min={0}
                max={videoDuration}
                onValueChange={(value) => {
                  setIsSeeking(true);
                  setVideoProgress(value[0]!);
                  void player?.internalPlayer.seekTo(value[0]!);
                  if (playerState !== YOUTUBE_PLAYER_STATES.PLAYING) {
                    toggleVideoPlayback();
                  }
                }}
                className="mr-4"
              />
              <div className="flex items-center justify-between pt-2">
                <div className="w-max font-mono text-sm font-bold">
                  {transformSecondsToFormattedTime(videoProgress)} /{" "}
                  {transformSecondsToFormattedTime(videoDuration)}
                </div>
              </div>
              {/* <Button
                  className="ml-2"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (!player.internalPlayer) return;
                    console.log(player.internalPlayer);
                    // player.internalPlayer.toggleFullscreen();
                  }}
                >
                  <FullscreenIcon size={16} />
                </Button> */}
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
