CREATE TABLE `serial_instapaper_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`username` text NOT NULL,
	`oauth_token` text NOT NULL,
	`oauth_token_secret` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `serial_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `serial_instapaper_connections_user_id_unique` ON `serial_instapaper_connections` (`user_id`);