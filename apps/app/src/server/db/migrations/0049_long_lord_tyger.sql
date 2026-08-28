CREATE TABLE `serial_atproto_auth_state` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `atproto_auth_state_expires_at_idx` ON `serial_atproto_auth_state` (`expires_at`);--> statement-breakpoint
CREATE TABLE `serial_atproto_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`did` text NOT NULL,
	`session` text,
	`scopes` text,
	`handle` text,
	`pds_url` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `serial_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `serial_atproto_connections_user_id_unique` ON `serial_atproto_connections` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `serial_atproto_connections_did_unique` ON `serial_atproto_connections` (`did`);