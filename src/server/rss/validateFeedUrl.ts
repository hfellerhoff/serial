const SUPPORTED_IF_INCLUDES = [
  "https://youtube.com/@",
  "https://www.youtube.com/@",
  "https://www.youtube.com/feeds/videos.xml?channel_id=",
];

export function validateFeedUrl(url: string) {
  return SUPPORTED_IF_INCLUDES.some((supported) => url.includes(supported));
}
