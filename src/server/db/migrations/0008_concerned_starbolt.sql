ALTER TABLE `serial_feed_item` RENAME COLUMN `is_hidden` TO `is_watch_later`;--> statement-breakpoint
ALTER TABLE `serial_feed_item` ADD COLUMN `is_vertical` integer DEFAULT false NOT NULL;
