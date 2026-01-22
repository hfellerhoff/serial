CREATE INDEX `content_categories_user_id_idx` ON `serial_content_categories` (`user_id`);--> statement-breakpoint
CREATE INDEX `feed_categories_category_id_idx` ON `serial_feed_categories` (`category_id`);--> statement-breakpoint
CREATE INDEX `feed_item_feed_id_posted_at_idx` ON `serial_feed_item` (`feed_id`,`posted_at`);--> statement-breakpoint
CREATE INDEX `feed_item_feed_id_is_watched_idx` ON `serial_feed_item` (`feed_id`,`is_watched`);--> statement-breakpoint
CREATE INDEX `feed_item_feed_id_is_watch_later_idx` ON `serial_feed_item` (`feed_id`,`is_watch_later`);--> statement-breakpoint
CREATE INDEX `feed_user_id_idx` ON `serial_feed` (`user_id`);--> statement-breakpoint
CREATE INDEX `feed_user_id_url_idx` ON `serial_feed` (`user_id`,`url`);--> statement-breakpoint
CREATE INDEX `view_categories_view_id_idx` ON `serial_view_categories` (`view_id`);--> statement-breakpoint
CREATE INDEX `view_user_id_idx` ON `serial_views` (`user_id`);--> statement-breakpoint
CREATE INDEX `view_user_id_placement_idx` ON `serial_views` (`user_id`,`placement`);