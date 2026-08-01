ALTER TABLE `serial_feed_item` ADD `canonical_url` text(4096);--> statement-breakpoint
CREATE INDEX `feed_item_canonical_url_idx` ON `serial_feed_item` (`canonical_url`);--> statement-breakpoint
CREATE INDEX `bookmark_user_saved_saved_at_idx` ON `serial_bookmark` (`user_id`,`is_saved`,`saved_updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `bookmark_user_saved_read_read_at_idx` ON `serial_bookmark` (`user_id`,`is_saved`,`is_read`,`read_updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `bookmark_user_saved_read_created_at_idx` ON `serial_bookmark` (`user_id`,`is_saved`,`is_read`,`created_at`,`id`);