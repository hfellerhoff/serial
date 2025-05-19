const SUPPORTED_IF_INCLUDES = [
  "https://youtube.com/@",
  "https://www.youtube.com/@",
  "https://youtube.com/channel/",
  "https://www.youtube.com/channel/",
  "https://www.youtube.com/feeds/videos.xml?channel_id=",
  "/feeds/videos.xml?accountId=", // PeerTube
  "/feeds/videos.xml?videoChannelId=", // PeerTube
];

export function validateFeedUrl(url: string) {
  return SUPPORTED_IF_INCLUDES.some((supported) => url.includes(supported));
}
