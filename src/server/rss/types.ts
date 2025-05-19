import type { FeedPlatform, feeds } from "~/server/db/schema";

export type NewFeedDetails = Omit<
  typeof feeds.$inferInsert,
  "id" | "createdAt" | "updatedAt" | "userId"
> & {
  platform: FeedPlatform;
};

export type RSSContent = {
  id: string;
  // type: ContentType;
  // platform: RSSPlatform;
  // category: ContentCategory;
  title: string;
  subtitle?: string;
  publishedDate: string;
  author: string;
  url: string;
  thumbnail?: string;
  content?: string;
  source?: {
    title?: string;
    description?: string;
    link?: string;
    feedUrl?: string;
    image?: {
      link?: string;
      url?: string;
      title?: string;
      width?: string;
      height?: string;
    };
  };
};

export type RSSFeed = {
  id: number;
  url: string;
  title: string;
  items: RSSContent[];
};
