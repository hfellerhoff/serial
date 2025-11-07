/* eslint-disable */
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import YouTube, { YouTubeEvent } from "react-youtube";
import { YouTubeVideoType, YOUTUBE_PLAYER_STATES } from "./constants";

type CustomVideoPlayerContext = {
  playerRef: React.RefObject<YouTube | null>;
  onStateChange: (event: YouTubeEvent) => void;
  toggleVideoPlayback: () => void;
  manualPlayerState: number;
  playerState: number;
  playbackSpeed: number;
  changeVideoPlaybackSpeed: (speed: number) => void;
  videoDuration: number;
  isSeeking: boolean;
  seekToSecond: (second: number) => void;
  videoProgress: number;
  videoType: YouTubeVideoType;
  startVideoHold: () => void;
  stopVideoHold: () => void;
};

const CustomVideoPlayerContext = createContext<CustomVideoPlayerContext | null>(
  null,
);

export function CustomVideoPlayerProvider({ children }: PropsWithChildren) {
  const playerRef = useRef<YouTube | null>(null);
  const [playerState, setPlayerState] = useState<number>(
    YOUTUBE_PLAYER_STATES.BUFFERING,
  );
  const [manualPlayerState, setManualPlayerState] = useState(playerState);

  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  const [videoType, setVideoType] = useState<YouTubeVideoType>("video");

  const changeVideoPlaybackSpeed = useCallback((speed: number) => {
    if (!playerRef?.current) return;
    const player = playerRef?.current as YouTube | null;

    setPlaybackSpeed(speed);
    void player?.internalPlayer?.setPlaybackRate(speed);
  }, []);

  // In an effort to prevent YouTube suggestions from playing in the embed,
  // we "pause" the video manually
  const videoHoldLocationRef = useRef<number | null>(null);
  const videoHoldSpeedRef = useRef<number | null>(null);
  const videoHoldTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setHoldTimeout = () => {
    if (!playerRef?.current) return null;
    const player = playerRef.current;

    return setTimeout(async () => {
      await player?.internalPlayer?.seekTo(videoHoldLocationRef.current);
      videoHoldTimeoutRef.current = setHoldTimeout();
    }, 0);
  };

  // in order to "hold" the video, we want to
  // - mute the video
  // - drop the playback speed super low
  // - rewind the video every X period of time back to the hold location
  const startVideoHold = useCallback(async () => {
    if (!playerRef?.current) return;
    const player = playerRef.current;

    setManualPlayerState(YOUTUBE_PLAYER_STATES.HELD);

    videoHoldLocationRef.current =
      await player?.internalPlayer?.getCurrentTime();

    videoHoldSpeedRef.current = await player?.internalPlayer?.getPlaybackRate();
    void player?.internalPlayer?.setPlaybackRate(0);

    player.internalPlayer.mute();

    videoHoldTimeoutRef.current = setHoldTimeout();
  }, []);

  const stopVideoHold = useCallback(() => {
    if (!playerRef?.current) return;
    const player = playerRef.current;

    player.internalPlayer.unMute();

    if (videoHoldSpeedRef.current) {
      void player?.internalPlayer?.setPlaybackRate(videoHoldSpeedRef.current);
      videoHoldSpeedRef.current = null;
    }

    if (videoHoldTimeoutRef.current) {
      clearTimeout(videoHoldTimeoutRef.current);
      videoHoldTimeoutRef.current = null;
    }

    if (videoHoldLocationRef.current) {
      void player?.internalPlayer?.seekTo(videoHoldLocationRef.current);
      videoHoldLocationRef.current = null;
    }

    setManualPlayerState(YOUTUBE_PLAYER_STATES.PLAYING);
  }, []);

  const firstPlayTimestampRef = useRef<number | null>(null);
  const toggleVideoPlayback = useCallback(() => {
    if (!playerRef?.current) return;
    if (!firstPlayTimestampRef.current) {
      firstPlayTimestampRef.current = Date.now();
    }

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

  const hasSeekedRef = useRef(false);
  const seekToSecond = useCallback(
    (seconds: number) => {
      if (!playerRef?.current) return;
      if (!hasSeekedRef.current) {
        hasSeekedRef.current = true;
      }

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

  const videoProgressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    const player = playerRef?.current;
    if (!player) return;

    const updateTime = async () => {
      const time = await player?.internalPlayer?.getCurrentTime();
      setVideoProgress(time || 0);

      const isUnderFiveSecondsFromPlay =
        firstPlayTimestampRef.current &&
        Date.now() - firstPlayTimestampRef.current < 5000;

      const isLive =
        time > 120 && isUnderFiveSecondsFromPlay && !hasSeekedRef.current;

      if (time > videoDuration || isLive) {
        setVideoType("live");
      }
    };

    if (playerState === YOUTUBE_PLAYER_STATES.PLAYING) {
      videoProgressIntervalRef.current = setInterval(updateTime, 250);
    } else if (videoProgressIntervalRef.current) {
      clearInterval(videoProgressIntervalRef.current);
    }
  }, [playerState]);

  const onStateChange = useCallback(
    (event: YouTubeEvent) => {
      setVideoDuration(event.target.getDuration());
      setVideoProgress(event.target.getCurrentTime());
      setPlayerState(event.data);

      if (manualPlayerState === YOUTUBE_PLAYER_STATES.HELD) {
        return;
      }

      if (event.data === YOUTUBE_PLAYER_STATES.PLAYING) {
        setTimeout(() => {
          setManualPlayerState(event.data);
          setIsSeeking(false);
        }, 50);
      } else {
        setManualPlayerState(event.data);
      }
    },
    [manualPlayerState],
  );

  return (
    <CustomVideoPlayerContext.Provider
      value={{
        playerRef,
        onStateChange,
        toggleVideoPlayback,
        manualPlayerState,
        playerState,
        playbackSpeed,
        changeVideoPlaybackSpeed,
        videoDuration,
        isSeeking,
        seekToSecond,
        videoProgress,
        videoType,
        startVideoHold,
        stopVideoHold,
      }}
    >
      {children}
    </CustomVideoPlayerContext.Provider>
  );
}

export function useCustomVideoPlayerContext() {
  const context = useContext(CustomVideoPlayerContext);

  if (!context) {
    throw new Error(
      "useCustomVideoPlayer must be used within a CustomVideoPlayerProvider",
    );
  }

  return context;
}
