ALTER TABLE `serial_feed` ADD `is_active` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `feed_user_id_is_active_idx` ON `serial_feed` (`user_id`,`is_active`);