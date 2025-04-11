"use client";

import { Ref, useCallback, useEffect, useRef, useState } from "react";
import classes from "./ResponsiveVideo.module.css";
import YouTube from "react-youtube";
import { YOUTUBE_PLAYER_STATES } from "./youtube";
import clsx from "clsx";
import { FullscreenIcon, PlayIcon } from "lucide-react";
import { Slider } from "./ui/slider";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Button } from "./ui/button";

type PlayerRefType = Ref<YouTube> | null;
function useVideoShortcuts() {
  const playerRef = useRef<PlayerRefType>(null);
  const [playerState, setPlayerState] = useState<number>(
    YOUTUBE_PLAYER_STATES.BUFFERING,
  );
  const [manualPlayerState, setManualPlayerState] = useState(playerState);

  const toggleVideoPlayback = useCallback(() => {
    if (!playerRef?.current) return;
    // @ts-expect-error ignore for now
    const player = playerRef?.current as YouTube;

    if (
      playerState === YOUTUBE_PLAYER_STATES.BUFFERING ||
      playerState === YOUTUBE_PLAYER_STATES.CUED ||
      playerState === YOUTUBE_PLAYER_STATES.PAUSED
    ) {
      player?.internalPlayer?.playVideo();
      return;
    }

    if (playerState === YOUTUBE_PLAYER_STATES.PLAYING) {
      setManualPlayerState(YOUTUBE_PLAYER_STATES.PAUSED);

      setTimeout(() => {
        player?.internalPlayer?.pauseVideo();
      }, 100);
      return;
    }
  }, [playerState, setManualPlayerState]);

  useEffect(() => {
    const processKey = async (event: KeyboardEvent) => {
      if (event.key === " ") {
        event.preventDefault();
        toggleVideoPlayback();

        return;
      }
    };
    window.addEventListener("keydown", processKey);

    return () => {
      window.removeEventListener("keydown", processKey);
    };
  }, [playerState, toggleVideoPlayback]);

  return {
    playerRef,
    toggleVideoPlayback,
    manualPlayerState,
    setManualPlayerState,
    setPlayerState,
  };
}

interface IResponsiveVideoProps {
  videoID?: string;
  videoSrc?: string;
}

export default function CustomVideoPlayer(props: IResponsiveVideoProps) {
  const {
    playerRef,
    toggleVideoPlayback,
    manualPlayerState,
    setManualPlayerState,
    setPlayerState,
  } = useVideoShortcuts();

  const [videoDuration, setVideoDuration] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isSeeking, setIsSeeking] = useState(false);

  // @ts-expect-error ignore for now
  const player = playerRef?.current as YouTube;

  console.log(manualPlayerState, isSeeking);

  return (
    <div className={classes.video}>
      <div
        style={{
          // @ts-expect-error need this
          "--aspect-ratio": "16/9",
        }}
      >
        {props.videoID && (
          <>
            <YouTube
              // @ts-expect-error ignore for now
              ref={playerRef}
              videoId={props.videoID}
              className="pointer-events-none h-full w-full"
              iframeClassName="w-full h-full border-none pointer-events-none"
              opts={{
                host: "https://www.youtube-nocookie.com",
                playerVars: { rel: 0 },
                rel: 0,
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

            <div className="pointer-events-none absolute -inset-2" />

            <div className="group">
              <div
                className={clsx("transition-all", {
                  "opacity-0":
                    manualPlayerState === YOUTUBE_PLAYER_STATES.PLAYING ||
                    isSeeking,
                })}
              >
                <img
                  className="absolute inset-0 h-full w-full object-cover"
                  src={`http://img.youtube.com/vi/${props.videoID}/maxresdefault.jpg`}
                />
                <button
                  onClick={toggleVideoPlayback}
                  className="absolute inset-0 inset-y-8 z-10 grid cursor-pointer place-items-center"
                >
                  <div className="bg-background grid size-20 place-items-center rounded-2xl shadow-2xl transition-all group-hover:scale-105">
                    <PlayIcon size={32} />
                  </div>
                </button>
              </div>
              <div className="absolute inset-x-4 bottom-4 z-20 flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                <Slider
                  value={[videoProgress]}
                  min={0}
                  max={videoDuration}
                  onValueChange={(value) => {
                    setIsSeeking(true);
                    setVideoProgress(value[0]!);
                    player.internalPlayer.seekTo(value[0]!);
                  }}
                  className="mr-4"
                />
                <ToggleGroup
                  type="single"
                  value={playbackSpeed.toString()}
                  onValueChange={(value) => {
                    if (!value) return;
                    const numberValue = parseFloat(value);

                    setPlaybackSpeed(numberValue);
                    player.internalPlayer.setPlaybackRate(numberValue);
                  }}
                  size="sm"
                >
                  <ToggleGroupItem value="1">1x</ToggleGroupItem>
                  <ToggleGroupItem value="1.5">1.5x</ToggleGroupItem>
                  <ToggleGroupItem value="2">2x</ToggleGroupItem>
                </ToggleGroup>
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
    </div>
  );
}
