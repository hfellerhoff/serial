UPDATE serial_feed_item
SET is_watched_updated_at = COALESCE(updated_at, created_at, posted_at)
WHERE is_watched = 1
  AND is_watched_updated_at IS NULL;
--> statement-breakpoint
UPDATE serial_feed_item
SET is_watch_later_updated_at = COALESCE(updated_at, created_at, posted_at)
WHERE is_watch_later = 1
  AND is_watch_later_updated_at IS NULL;
