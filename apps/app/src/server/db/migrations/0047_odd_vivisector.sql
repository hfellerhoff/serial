CREATE TABLE `serial_extension_session` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `serial_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `serial_extension_session_token_hash_unique` ON `serial_extension_session` (`token_hash`);--> statement-breakpoint
CREATE INDEX `extension_session_user_id_idx` ON `serial_extension_session` (`user_id`);--> statement-breakpoint
CREATE INDEX `extension_session_expires_at_idx` ON `serial_extension_session` (`expires_at`);--> statement-breakpoint
DROP INDEX `feed_is_active_next_fetch_at_idx`;--> statement-breakpoint
CREATE INDEX `feed_user_id_is_active_next_fetch_at_idx` ON `serial_feed` (`user_id`,`is_active`,`next_fetch_at`);