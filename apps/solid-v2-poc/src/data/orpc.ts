import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

import type {
  ContentStatus,
  FeedItem,
  FeedView,
  SetWatchLaterInput,
  SetWatchedInput,
  SolidFeedTransport,
  ViewItemsInput,
} from './transport';

/**
 * Narrow wire shapes for the four existing procedures used by this PoC.
 *
 * The authoritative procedure definitions remain in apps/app/src/server/api/routers/
 * {viewRouter,initialRouter,feedItemRouter}. Importing that server router from this
 * sibling app would pull the production server dependency graph into a browser build,
 * so this boundary deliberately describes only fields it consumes.
 */
type WireDate = Date | string;

type WireView = FeedView;

type WireFeedItem = Omit<
  FeedItem,
  | 'isWatchedUpdatedAt'
  | 'isWatchLaterUpdatedAt'
  | 'postedAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  isWatchedUpdatedAt: WireDate | null;
  isWatchLaterUpdatedAt: WireDate | null;
  postedAt: WireDate;
  createdAt: WireDate;
  updatedAt: WireDate;
};

export type ViewItemsCursor = {
  placement?: number;
  postedAt: Date;
  id: string;
  isWatchedUpdatedAt?: Date | null;
  isWatchLaterUpdatedAt?: Date | null;
};

export type ViewItemsPageInput = ViewItemsInput & {
  cursor?: ViewItemsCursor | null;
  limit?: number;
};

export type ViewItemsPage = {
  viewId: number;
  contentStatus: ContentStatus;
  items: readonly FeedItem[];
  hasMore: boolean;
  nextCursor: ViewItemsCursor | null;
  replacesScope: boolean;
  membershipRevision?: number;
};

type WireViewItemsCursor = {
  placement?: number;
  postedAt: WireDate;
  id: string;
  isWatchedUpdatedAt?: WireDate | null;
  isWatchLaterUpdatedAt?: WireDate | null;
};

type WireViewItemsChunk =
  | {
      type: 'feed-items';
      viewId: number;
      feedItems: WireFeedItem[];
      contentStatusFilter: ContentStatus;
      hasMore: boolean;
      nextCursor: WireViewItemsCursor | null;
      replacesScope?: boolean;
      membershipRevision?: number;
    }
  | {
      type: 'view-diff';
      viewId: number;
      contentStatusFilter: ContentStatus;
      hasMore: boolean;
      cursor: WireViewItemsCursor | null;
      replacesScope?: boolean;
      membershipRevision?: number;
    }
  | { type: 'error'; message: string; phase: string };

type WatchedWireResult = {
  id: string;
  isWatched: boolean;
  updatedAt: WireDate;
};

type WatchLaterWireResult = {
  id: string;
  isWatchLater: boolean;
  updatedAt: WireDate;
};

type SerialRpcClient = {
  view: {
    getAll: () => Promise<WireView[]>;
  };
  initial: {
    getItemsByContentStatus: (input: {
      viewId: number;
      contentStatusFilter: ContentStatus;
      cursor?: WireViewItemsCursor | null;
      limit?: number;
    }) => Promise<AsyncIterable<WireViewItemsChunk>>;
  };
  feedItem: {
    getById: (input: { id: string }) => Promise<WireFeedItem | null>;
    setWatchedValue: (input: {
      id: string;
      feedId: number;
      isWatched: boolean;
    }) => Promise<WatchedWireResult>;
    setWatchLaterValue: (input: {
      id: string;
      feedId: number;
      isWatchLater: boolean;
    }) => Promise<WatchLaterWireResult>;
  };
};

export class OrpcStreamError extends Error {
  readonly phase: string;

  constructor(message: string, phase: string) {
    super(message);
    this.name = 'OrpcStreamError';
    this.phase = phase;
  }
}

function asDate(value: WireDate): Date {
  return value instanceof Date ? value : new Date(value);
}

function asNullableDate(value: WireDate | null): Date | null {
  return value === null ? null : asDate(value);
}

function mapView(view: WireView): FeedView {
  return {
    id: view.id,
    name: view.name,
    placement: view.placement,
    layout: view.layout,
  };
}

function mapFeedItem(item: WireFeedItem): FeedItem {
  return {
    id: item.id,
    feedId: item.feedId,
    contentId: item.contentId,
    title: item.title,
    author: item.author,
    url: item.url,
    thumbnail: item.thumbnail,
    content: item.content,
    contentSnippet: item.contentSnippet,
    contentType: item.contentType,
    platform: item.platform,
    orientation: item.orientation,
    isWatched: item.isWatched,
    isWatchedUpdatedAt: asNullableDate(item.isWatchedUpdatedAt),
    isWatchLater: item.isWatchLater,
    isWatchLaterUpdatedAt: asNullableDate(item.isWatchLaterUpdatedAt),
    progress: item.progress,
    duration: item.duration,
    postedAt: asDate(item.postedAt),
    createdAt: asDate(item.createdAt),
    updatedAt: asDate(item.updatedAt),
    contentHash: item.contentHash,
  };
}

function mapCursor(cursor: WireViewItemsCursor | null): ViewItemsCursor | null {
  if (!cursor) return null;

  return {
    ...cursor,
    postedAt: asDate(cursor.postedAt),
    isWatchedUpdatedAt:
      cursor.isWatchedUpdatedAt === undefined
        ? undefined
        : asNullableDate(cursor.isWatchedUpdatedAt),
    isWatchLaterUpdatedAt:
      cursor.isWatchLaterUpdatedAt === undefined
        ? undefined
        : asNullableDate(cursor.isWatchLaterUpdatedAt),
  };
}

function getRpcUrl() {
  if (typeof window === 'undefined') {
    throw new Error(
      'The Solid PoC oRPC adapter must be called in the browser so it can reuse the authenticated session cookie.',
    );
  }

  return new URL('/api/rpc', window.location.origin);
}

const link = new RPCLink({
  // Browser calls stay same-origin so auth cookies are included. In development,
  // Vite proxies this path to SERIAL_SOLID_POC_BACKEND_URL.
  url: getRpcUrl,
});

export const serialRpcClient = createORPCClient(
  link,
) as unknown as SerialRpcClient;

export async function listViewItemsPage(
  input: ViewItemsPageInput,
  client: SerialRpcClient = serialRpcClient,
): Promise<ViewItemsPage> {
  const stream = await client.initial.getItemsByContentStatus({
    viewId: input.viewId,
    contentStatusFilter: input.contentStatus,
    cursor: input.cursor,
    limit: input.limit,
  });

  const items: FeedItem[] = [];
  let hasMore = false;
  let nextCursor: ViewItemsCursor | null = null;
  let replacesScope = false;
  let membershipRevision: number | undefined;

  for await (const chunk of stream) {
    if (chunk.type === 'error') {
      throw new OrpcStreamError(chunk.message, chunk.phase);
    }

    if (chunk.type !== 'feed-items') continue;

    items.push(...chunk.feedItems.map(mapFeedItem));
    hasMore = chunk.hasMore;
    nextCursor = mapCursor(chunk.nextCursor);
    replacesScope ||= chunk.replacesScope === true;
    membershipRevision = chunk.membershipRevision ?? membershipRevision;
  }

  return {
    viewId: input.viewId,
    contentStatus: input.contentStatus,
    items,
    hasMore,
    nextCursor,
    replacesScope,
    membershipRevision,
  };
}

export function createOrpcTransport(
  client: SerialRpcClient = serialRpcClient,
): SolidFeedTransport {
  return {
    async listViews() {
      return (await client.view.getAll()).map(mapView);
    },

    async listViewItems(input) {
      return (await listViewItemsPage(input, client)).items;
    },

    async setWatched(input: SetWatchedInput) {
      await client.feedItem.setWatchedValue({
        id: input.id,
        feedId: input.feedId,
        isWatched: input.isWatched,
      });
    },

    async setWatchLater(input: SetWatchLaterInput) {
      await client.feedItem.setWatchLaterValue({
        id: input.id,
        feedId: input.feedId,
        isWatchLater: input.isWatchLater,
      });
    },
  };
}

export const orpcTransport = createOrpcTransport();

export async function getFeedItem(
  id: string,
  client: SerialRpcClient = serialRpcClient,
): Promise<FeedItem | null> {
  const item = await client.feedItem.getById({ id });
  return item ? mapFeedItem(item) : null;
}
