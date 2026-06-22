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

export const YOUTUBE_CAPTION_SIZES = [
  { label: "Small", value: -1 },
  { label: "Normal", value: 0 },
  { label: "Large", value: 1 },
  { label: "Larger", value: 2 },
  { label: "Largest", value: 3 },
];

export const YOUTUBE_PLAYER_ERROR_CODES = {
  INVALID_PARAMETER: 2,
  HTML5_PLAYER: 5,
  NOT_FOUND_OR_PRIVATE: 100,
  EMBED_NOT_ALLOWED: 101,
  EMBED_NOT_ALLOWED_DISGUISED: 150,
  MISSING_CLIENT_IDENTITY: 153,
} as const;

export const YOUTUBE_PLAYER_DEFAULT_ERROR_MESSAGE =
  "This YouTube embed could not be played.";

export type YouTubePlayerErrorCode =
  (typeof YOUTUBE_PLAYER_ERROR_CODES)[keyof typeof YOUTUBE_PLAYER_ERROR_CODES];

export const YOUTUBE_PLAYER_ERROR_MESSAGES: Record<
  YouTubePlayerErrorCode,
  string
> = {
  [YOUTUBE_PLAYER_ERROR_CODES.INVALID_PARAMETER]:
    "The YouTube video ID is invalid.",
  [YOUTUBE_PLAYER_ERROR_CODES.HTML5_PLAYER]:
    "YouTube could not play this video in the embedded player.",
  [YOUTUBE_PLAYER_ERROR_CODES.NOT_FOUND_OR_PRIVATE]:
    "This YouTube video was removed, is private, or could not be found.",
  [YOUTUBE_PLAYER_ERROR_CODES.EMBED_NOT_ALLOWED]:
    "This YouTube video cannot be played in embedded players.",
  [YOUTUBE_PLAYER_ERROR_CODES.EMBED_NOT_ALLOWED_DISGUISED]:
    "This YouTube video cannot be played in embedded players.",
  [YOUTUBE_PLAYER_ERROR_CODES.MISSING_CLIENT_IDENTITY]:
    "YouTube could not identify this embedded player request.",
};
