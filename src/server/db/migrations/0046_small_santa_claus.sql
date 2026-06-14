ALTER TABLE `serial_feed_item` ADD `is_watched_updated_at` integer;--> statement-breakpoint
ALTER TABLE `serial_feed_item` ADD `is_watch_later_updated_at` integer;--> statement-breakpoint
CREATE INDEX `feed_item_feed_id_is_watched_updated_at_idx` ON `serial_feed_item` (`feed_id`,`is_watched`,`is_watched_updated_at`);--> statement-breakpoint
ALTER TABLE `serial_view_sections` DROP COLUMN `name`;--> statement-breakpoint
ALTER TABLE `serial_view_sections` DROP COLUMN `content_type`;--> statement-breakpoint
ALTER TABLE `serial_view_sections` DROP COLUMN `days_window`;