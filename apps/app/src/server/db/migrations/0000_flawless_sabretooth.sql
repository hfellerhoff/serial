CREATE TABLE `serial_content_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text(256) NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `serial_feed_categories` (
	`feed_id` integer,
	`category_id` integer,
	PRIMARY KEY(`category_id`, `feed_id`),
	FOREIGN KEY (`feed_id`) REFERENCES `serial_feed`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `serial_content_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `serial_feed_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`feed_id` integer,
	`content_id` text(512) NOT NULL,
	`title` text(512) NOT NULL,
	`url` text(512) NOT NULL,
	`is_watched` integer DEFAULT false NOT NULL,
	`is_hidden` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `serial_feed`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `serial_feed` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text DEFAULT '' NOT NULL,
	`name` text(256) DEFAULT '' NOT NULL,
	`url` text(512) DEFAULT '' NOT NULL,
	`platform` text(256) DEFAULT 'youtube' NOT NULL,
	`categories` text(256) DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `content_categories_name_idx` ON `serial_content_categories` (`name`);--> statement-breakpoint
CREATE INDEX `feed_item_feed_id_idx` ON `serial_feed_item` (`feed_id`);--> statement-breakpoint
CREATE INDEX `feed_name_idx` ON `serial_feed` (`name`);