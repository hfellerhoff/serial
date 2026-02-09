/* eslint-disable */
"use client";

import clsx from "clsx";
import {
  ALargeSmallIcon,
  CaptionsIcon,
  CaptionsOffIcon,
  FullscreenIcon,
  LanguagesIcon,
  MaximizeIcon,
  MinimizeIcon,
  PlayIcon,
  Settings2Icon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import YouTube from "react-youtube";
import { useView } from "~/components/feed/watch/[id]/useView";
import { useFlagState } from "~/lib/hooks/useFlagState";
import { transformSecondsToFormattedTime } from "~/lib/transformSecondsToFormattedTime";
import { ButtonWithShortcut } from "../ButtonWithShortcut";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Slider } from "../ui/slider";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import {
  CustomVideoPlayerProvider,
  useCustomVideoPlayerContext,
} from "./CustomVideoPlayerProvider";
import {
  YOUTUBE_CAPTION_SIZES,
  YOUTUBE_PLAYBACK_SPEEDS,
  YOUTUBE_PLAYER_STATES,
} from "./constants";
import { useVideoShortcuts } from "./useYouTubeVideoShortcuts";

interface IResponsiveVideoProps {
  videoID?: string;
  videoSrc?: string;
  orientation: "vertical" | "horizontal";
  isInactive: boolean;
  isEmbed?: boolean;
}

function CustomVideoPlayerContent(props: IResponsiveVideoProps) {
  const {
    playerRef,
    onStateChange,
    onPlayerReady,
    toggleVideoPlayback,
    manualPlayerState,
    playbackSpeed,
    changeVideoPlaybackSpeed,
    videoDuration,
    isSeeking,
    videoProgress,
    seekToSecond,
    videoType,
    captionsEnabled,
    captionsAvailable,
    captionsModuleLoaded,
    toggleCaptions,
    captionSize,
    setCaptionSize,
    captionTracks,
    currentCaptionTrack,
    setCaptionTrack,
    isNativeFullscreen,
    toggleNativeFullscreen,
    videoContainerRef,
    isMuted,
    toggleMute,
  } = useCustomVideoPlayerContext();
  useVideoShortcuts({ disabled: props.isEmbed });

  const { view, setView, toggleView } = useView();

  // Wrap toggleNativeFullscreen to exit windowed fullscreen first
  const handleNativeFullscreen = () => {
    if (view === "fullscreen") {
      setView("windowed"); // Exit windowed fullscreen
    }
    toggleNativeFullscreen();
  };

  // Wrap toggleView to exit native fullscreen first
  const handleWindowedFullscreen = () => {
    if (isNativeFullscreen) {
      document.exitFullscreen();
    }
    toggleView();
  };
  const [hasInlineShortcutsVisible] = useFlagState("INLINE_SHORTCUTS");

  const player = playerRef?.current;

  const shouldShowVideoTimestamps = videoType === "video";
  const shouldShowLiveTimestamps =
    videoType === "live" && videoProgress < videoDuration;
  const shouldShowTimestamps =
    shouldShowVideoTimestamps || shouldShowLiveTimestamps;

  return (
    <div ref={videoContainerRef} className="relative h-full w-full bg-black">
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
            onReady={onPlayerReady}
            loading="eager"
          />
          <div className="group">
            <div
              className={clsx("transition-all", {
                "opacity-0":
                  manualPlayerState === YOUTUBE_PLAYER_STATES.PLAYING ||
                  manualPlayerState === YOUTUBE_PLAYER_STATES.HELD ||
                  isSeeking,
              })}
            >
              <div className="absolute inset-0 h-full w-full bg-black">
                <img
                  className={clsx("h-full w-full", {
                    "object-cover": props.orientation === "vertical",
                    "object-contain": props.orientation === "horizontal",
                  })}
                  src={`https://img.youtube.com/vi/${props.videoID}/maxresdefault.jpg`}
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
                      className="-ml-3 flex w-max flex-row items-center gap-2 font-sans text-sm font-bold"
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ButtonWithShortcut
                        shortcut="m"
                        size="icon"
                        variant={
                          hasInlineShortcutsVisible === "show-shortcuts"
                            ? "outline"
                            : "ghost"
                        }
                        onClick={toggleMute}
                      >
                        {isMuted ? (
                          <VolumeXIcon size={16} />
                        ) : (
                          <Volume2Icon size={16} />
                        )}
                      </ButtonWithShortcut>
                    </TooltipTrigger>
                    <TooltipContent>Toggle mute</TooltipContent>
                  </Tooltip>
                  {captionsEnabled &&
                    captionsModuleLoaded &&
                    captionsAvailable && (
                      <DropdownMenu>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost">
                                <Settings2Icon size={16} />
                              </Button>
                            </DropdownMenuTrigger>
                          </TooltipTrigger>
                          <TooltipContent>Caption options</TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent>
                          {captionTracks.length > 0 && (
                            <>
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                  <LanguagesIcon size={14} className="mr-2" />
                                  Language
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  <DropdownMenuRadioGroup
                                    value={
                                      currentCaptionTrack?.languageCode ?? ""
                                    }
                                    onValueChange={(value) => {
                                      const track = captionTracks.find(
                                        (t) => t.languageCode === value,
                                      );
                                      if (track) setCaptionTrack(track);
                                    }}
                                  >
                                    {captionTracks.map((track) => (
                                      <DropdownMenuRadioItem
                                        key={track.languageCode}
                                        value={track.languageCode}
                                      >
                                        {track.displayName ||
                                          track.languageName ||
                                          track.languageCode}
                                      </DropdownMenuRadioItem>
                                    ))}
                                  </DropdownMenuRadioGroup>
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <ALargeSmallIcon size={14} className="mr-2" />
                              Size
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              <DropdownMenuRadioGroup
                                value={captionSize.toString()}
                                onValueChange={(value) =>
                                  setCaptionSize(parseInt(value))
                                }
                              >
                                {YOUTUBE_CAPTION_SIZES.map((size) => (
                                  <DropdownMenuRadioItem
                                    key={size.value}
                                    value={size.value.toString()}
                                  >
                                    {size.label}
                                  </DropdownMenuRadioItem>
                                ))}
                              </DropdownMenuRadioGroup>
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  {(() => {
                    const isDisabled =
                      !captionsModuleLoaded || !captionsAvailable;
                    const tooltipMessage = isDisabled
                      ? !captionsModuleLoaded
                        ? "Play video to load available captions"
                        : "Captions not available"
                      : "Toggle captions";

                    return (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <ButtonWithShortcut
                            shortcut="c"
                            size="icon"
                            variant={
                              hasInlineShortcutsVisible === "show-shortcuts"
                                ? "outline"
                                : "ghost"
                            }
                            onClick={toggleCaptions}
                            disabled={isDisabled}
                          >
                            {captionsEnabled ? (
                              <CaptionsIcon size={16} />
                            ) : (
                              <CaptionsOffIcon size={16} />
                            )}
                          </ButtonWithShortcut>
                        </TooltipTrigger>
                        <TooltipContent>{tooltipMessage}</TooltipContent>
                      </Tooltip>
                    );
                  })()}
                  {!props.isEmbed && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ButtonWithShortcut
                          shortcut="F"
                          size="icon"
                          variant={
                            hasInlineShortcutsVisible === "show-shortcuts"
                              ? "outline"
                              : "ghost"
                          }
                          onClick={handleWindowedFullscreen}
                        >
                          {view === "fullscreen" ? (
                            <MinimizeIcon size={16} />
                          ) : (
                            <MaximizeIcon size={16} />
                          )}
                        </ButtonWithShortcut>
                      </TooltipTrigger>
                      <TooltipContent>
                        Toggle windowed fullscreen
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ButtonWithShortcut
                        shortcut="f"
                        size="icon"
                        variant={
                          hasInlineShortcutsVisible === "show-shortcuts"
                            ? "outline"
                            : "ghost"
                        }
                        onClick={handleNativeFullscreen}
                      >
                        <FullscreenIcon size={16} />
                      </ButtonWithShortcut>
                    </TooltipTrigger>
                    <TooltipContent>Toggle fullscreen</TooltipContent>
                  </Tooltip>
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
