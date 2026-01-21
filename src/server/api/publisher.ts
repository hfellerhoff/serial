import { MemoryPublisher } from "@orpc/experimental-publisher/memory";
import type {
  GetByViewChunk,
  GetItemsByCategoryIdChunk,
  GetItemsByFeedChunk,
  GetItemsByVisibilityChunk,
  RevalidateViewChunk,
} from "./routers/initialRouter";

// Union of all chunk types that can be published
export type PublishedChunk =
  | { source: "initial"; chunk: GetByViewChunk }
  | { source: "revalidate"; chunk: RevalidateViewChunk }
  | { source: "visibility"; chunk: GetItemsByVisibilityChunk }
  | { source: "feed"; chunk: GetItemsByFeedChunk }
  | { source: "category"; chunk: GetItemsByCategoryIdChunk }
  | { source: "new-data"; chunk: GetByViewChunk };

// Dynamic channels keyed by user ID
export const publisher = new MemoryPublisher<Record<string, PublishedChunk>>({
  resumeRetentionSeconds: 60 * 2, // 2 minute retention for reconnects
});
