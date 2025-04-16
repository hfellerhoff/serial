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

  const onStateChange = useCallback((event: YouTubeEvent) => {
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
  }, []);

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
