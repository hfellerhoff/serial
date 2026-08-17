export type SaveStatus = 'inbox' | 'saved';

export type ArchiveStatus = 'unread' | 'archived';

export interface ContentStatus {
  saveStatus: SaveStatus;
  archiveStatus: ArchiveStatus;
}

export interface FeedItem {
  id: string;
  feedId: number;
  contentId: string;
  title: string;
  author: string;
  url: string;
  thumbnail: string;
  content: string;
  contentSnippet: string;
  contentType: 'text' | 'video';
  platform: 'website' | 'youtube' | 'peertube' | 'nebula';
  orientation: 'horizontal' | 'vertical' | null;
  isWatched: boolean;
  isWatchedUpdatedAt: Date | null;
  isWatchLater: boolean;
  isWatchLaterUpdatedAt: Date | null;
  progress: number;
  duration: number;
  postedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  contentHash: string | null;
}

export interface FeedView {
  id: number;
  name: string;
  placement: number;
  layout: string;
}

export interface ViewItemsInput {
  viewId: number;
  contentStatus: ContentStatus;
}

export interface SetWatchedInput {
  id: string;
  feedId: number;
  isWatched: boolean;
}

export interface SetWatchLaterInput {
  id: string;
  feedId: number;
  isWatchLater: boolean;
}

/**
 * The model's only I/O seam. The oRPC adapter owns streaming and wire shapes;
 * the Solid graph only sees complete domain snapshots and mutation promises.
 */
export interface SolidFeedTransport {
  listViews(): Promise<readonly FeedView[]>;
  listViewItems(input: ViewItemsInput): Promise<readonly FeedItem[]>;
  setWatched(input: SetWatchedInput): Promise<void>;
  setWatchLater(input: SetWatchLaterInput): Promise<void>;
}
