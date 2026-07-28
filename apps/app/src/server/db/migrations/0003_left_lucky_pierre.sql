CREATE TABLE `serial_user_config` (
	`user_id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`light_hsl` text(16) DEFAULT '' NOT NULL,
	`dark_hsl` text(16) DEFAULT '' NOT NULL
);
