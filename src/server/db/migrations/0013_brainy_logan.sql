CREATE TABLE `serial_view_categories` (
	`view_id` integer,
	`category_id` integer,
	PRIMARY KEY(`view_id`, `category_id`),
	FOREIGN KEY (`view_id`) REFERENCES `serial_views`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `serial_content_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `serial_views` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text DEFAULT '' NOT NULL,
	`name` text(256) DEFAULT '' NOT NULL,
	`days_window` integer DEFAULT 1 NOT NULL,
	`read_status` integer DEFAULT -1 NOT NULL,
	`orientation` text(16) DEFAULT 'horizontal' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `view_name_idx` ON `serial_views` (`name`);