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
import {
  useCaptionsEnabled,
  useCaptionSize,
  useSetCaptionsEnabled,
  useSetCaptionSize,
} from "~/lib/data/captions/store";

export type CaptionTrack = {
  languageCode: string;
  languageName: string;
  displayName?: string;
};

type CustomVideoPlayerContext = {
  playerRef: React.RefObject<YouTube | null>;
  videoContainerRef: React.RefObject<HTMLDivElement | null>;
  onStateChange: (event: YouTubeEvent) => void;
  onPlayerReady: (event: YouTubeEvent) => void;
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
  captionsEnabled: boolean;
  captionsAvailable: boolean;
  captionsModuleLoaded: boolean;
  toggleCaptions: () => void;
  captionSize: number;
  setCaptionSize: (size: number) => void;
  captionTracks: CaptionTrack[];
  currentCaptionTrack: CaptionTrack | null;
  setCaptionTrack: (track: CaptionTrack) => void;
  isNativeFullscreen: boolean;
  toggleNativeFullscreen: () => void;
  isMuted: boolean;
  toggleMute: () => void;
};

const CustomVideoPlayerContext = createContext<CustomVideoPlayerContext | null>(
  null,
);

export function CustomVideoPlayerProvider({ children }: PropsWithChildren) {
  const playerRef = useRef<YouTube | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const [playerState, setPlayerState] = useState<number>(
    YOUTUBE_PLAYER_STATES.BUFFERING,
  );
  const [manualPlayerState, setManualPlayerState] = useState(playerState);

  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  const [videoType, setVideoType] = useState<YouTubeVideoType>("video");

  // Use Zustand store for persistent caption preferences
  const captionsEnabled = useCaptionsEnabled();
  const setCaptionsEnabled = useSetCaptionsEnabled();
  const captionSize = useCaptionSize();
  const setCaptionSizeState = useSetCaptionSize();

  const [captionTracks, setCaptionTracks] = useState<CaptionTrack[]>([]);
  const [currentCaptionTrack, setCurrentCaptionTrack] =
    useState<CaptionTrack | null>(null);
  const [captionsModuleLoaded, setCaptionsModuleLoaded] = useState(false);
  const captionsModuleLoadedRef = useRef(false);
  const pendingCaptionEnableRef = useRef(false);

  // Native fullscreen state
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);

  // Mute state
  const [isMuted, setIsMuted] = useState(false);

  const toggleMute = useCallback(() => {
    if (!playerRef?.current) return;
    const player = playerRef.current.internalPlayer;

    if (isMuted) {
      player?.unMute();
      setIsMuted(false);
    } else {
      player?.mute();
      setIsMuted(true);
    }
  }, [isMuted]);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsNativeFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Toggle native fullscreen - targets the video container
  const toggleNativeFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(console.error);
    } else {
      // Use the video container ref, fallback to player container
      const container =
        videoContainerRef.current ?? playerRef.current?.container;
      if (container) {
        container.requestFullscreen().catch(console.error);
      }
    }
  }, []);

  // Derived state: captions are available when tracks are loaded
  const captionsAvailable = captionTracks.length > 0;

  type YouTubePlayerInternal = any;

  // Fetch and store caption tracks from the player
  const fetchCaptionTracks = useCallback((target?: YouTubePlayerInternal) => {
    const player = target ?? playerRef?.current?.internalPlayer;
    if (!player) return null;

    const tracks = player.getOption?.("captions", "tracklist");
    if (tracks && tracks.length > 0) {
      setCaptionTracks(tracks as CaptionTrack[]);
      return tracks as CaptionTrack[];
    }
    return null;
  }, []);

  // Enable captions with a specific track or the default
  const enableCaptionsWithTrack = useCallback(
    (target?: YouTubePlayerInternal, tracks?: CaptionTrack[]) => {
      const player = target ?? playerRef?.current?.internalPlayer;
      if (!player || !tracks || tracks.length === 0) return;

      // Set the first available track (or English if available)
      const englishTrack = tracks.find(
        (t: CaptionTrack) =>
          t.languageCode === "en" || t.languageCode?.startsWith("en"),
      );
      const trackToUse = englishTrack ?? tracks[0];
      if (trackToUse) {
        setCurrentCaptionTrack(trackToUse);
        player.setOption?.("captions", "track", {
          languageCode: trackToUse.languageCode,
        });
      }
    },
    [],
  );

  // Handler for onApiChange event - called when captions module loads
  const handleApiChange = useCallback(
    (target: YouTubePlayerInternal) => {
      // Check which modules are available
      const modules = target.getOptions?.();
      if (!modules || !modules.includes("captions")) return;

      captionsModuleLoadedRef.current = true;
      setCaptionsModuleLoaded(true);

      // Fetch tracks (with a small delay as tracks may not be immediately available)
      setTimeout(() => {
        const tracks = fetchCaptionTracks(target);

        // If we have a pending caption enable request, complete it now
        if (pendingCaptionEnableRef.current && tracks && tracks.length > 0) {
          pendingCaptionEnableRef.current = false;
          enableCaptionsWithTrack(target, tracks);
        }
        // If captions are enabled (user preference) and tracks are available, auto-enable
        else if (captionsEnabled && tracks && tracks.length > 0) {
          enableCaptionsWithTrack(target, tracks);
        }
      }, 100);
    },
    [fetchCaptionTracks, enableCaptionsWithTrack, captionsEnabled],
  );

  // Set up the onApiChange listener when player is ready
  const onPlayerReady = useCallback(
    (event: YouTubeEvent) => {
      event.target.addEventListener("onApiChange", () =>
        handleApiChange(event.target),
      );
    },
    [handleApiChange],
  );

  const setCaptionTrack = useCallback((track: CaptionTrack) => {
    if (!playerRef?.current) return;
    const player = playerRef.current.internalPlayer;

    setCurrentCaptionTrack(track);
    player?.setOption?.("captions", "track", {
      languageCode: track.languageCode,
    });
  }, []);

  const toggleCaptions = useCallback(() => {
    if (!playerRef?.current) return;
    const player = playerRef.current.internalPlayer;

    const newCaptionsEnabled = !captionsEnabled;

    if (newCaptionsEnabled) {
      // If captions module is loaded and we have tracks, enable immediately
      if (captionsModuleLoadedRef.current && captionTracks.length > 0) {
        setCaptionsEnabled(true);
        enableCaptionsWithTrack(player, captionTracks);
      } else if (captionsModuleLoadedRef.current) {
        // Module loaded but no tracks - try fetching again
        const tracks = fetchCaptionTracks(player);
        if (tracks && tracks.length > 0) {
          setCaptionsEnabled(true);
          enableCaptionsWithTrack(player, tracks);
        }
      } else {
        // Module not loaded yet - mark pending and it will enable when onApiChange fires
        pendingCaptionEnableRef.current = true;
      }
    } else {
      // Disable captions by setting an empty track
      setCaptionsEnabled(false);
      setCurrentCaptionTrack(null);
      player?.setOption?.("captions", "track", {});
    }
  }, [
    captionsEnabled,
    captionTracks,
    enableCaptionsWithTrack,
    fetchCaptionTracks,
  ]);

  const setCaptionSize = useCallback((size: number) => {
    if (!playerRef?.current) return;
    const player = playerRef.current;

    setCaptionSizeState(size);
    void player.internalPlayer?.setOption("captions", "fontSize", size);
  }, []);

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

  const hasLoadedCaptionsModuleRef = useRef(false);

  const onStateChange = useCallback(
    (event: YouTubeEvent) => {
      setVideoDuration(event.target.getDuration());
      setVideoProgress(event.target.getCurrentTime());
      setPlayerState(event.data);

      if (manualPlayerState === YOUTUBE_PLAYER_STATES.HELD) {
        return;
      }

      if (event.data === YOUTUBE_PLAYER_STATES.PLAYING) {
        // Load captions module when video starts playing (required for captions API)
        if (!hasLoadedCaptionsModuleRef.current) {
          hasLoadedCaptionsModuleRef.current = true;
          // Load the captions module - this will trigger onApiChange
          event.target.loadModule?.("captions");
        }

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
        videoContainerRef,
        onStateChange,
        onPlayerReady,
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
        isMuted,
        toggleMute,
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
