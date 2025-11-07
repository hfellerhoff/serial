export const YOUTUBE_PLAYER_STATES = {
  // youtube states
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,

  // custom states
  HELD: 6,
} as const;

export const YOUTUBE_PLAYBACK_SPEEDS = [
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
export const YOUTUBE_FASTEST_SPEED =
  YOUTUBE_PLAYBACK_SPEEDS[YOUTUBE_PLAYBACK_SPEEDS.length - 1]!.value;

export const YOUTUBE_VIDEO_TYPES = ["video", "live"] as const;
export type YouTubeVideoType = (typeof YOUTUBE_VIDEO_TYPES)[number];
