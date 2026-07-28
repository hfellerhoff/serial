DROP INDEX `content_categories_name_idx`;--> statement-breakpoint
DROP INDEX `content_categories_user_id_idx`;--> statement-breakpoint
CREATE INDEX `content_categories_user_id_name_idx` ON `serial_content_categories` (`user_id`,`name`);--> statement-breakpoint
DROP INDEX `feed_item_id_idx`;--> statement-breakpoint
DROP INDEX `feed_item_feed_id_is_watched_idx`;--> statement-breakpoint
DROP INDEX `feed_item_feed_id_is_watch_later_idx`;--> statement-breakpoint
CREATE INDEX `feed_item_feed_id_visibility_posted_at_idx` ON `serial_feed_item` (`feed_id`,`is_watched`,`is_watch_later`,`posted_at`);--> statement-breakpoint
CREATE INDEX `feed_item_feed_id_is_watch_later_posted_at_idx` ON `serial_feed_item` (`feed_id`,`is_watch_later`,`posted_at`);--> statement-breakpoint
DROP INDEX `feed_name_idx`;--> statement-breakpoint
DROP INDEX `feed_user_id_is_active_idx`;--> statement-breakpoint
CREATE INDEX `feed_user_id_is_active_idx` ON `serial_feed` (`user_id`,`is_active`,`last_fetched_at`);--> statement-breakpoint
DROP INDEX `view_name_idx`;--> statement-breakpoint
CREATE INDEX `session_created_at_idx` ON `serial_session` (`created_at`);--> statement-breakpoint
CREATE INDEX `user_created_at_idx` ON `serial_user` (`created_at`);--> statement-breakpoint
CREATE INDEX `user_next_refresh_at_idx` ON `serial_user` (`next_refresh_at`);