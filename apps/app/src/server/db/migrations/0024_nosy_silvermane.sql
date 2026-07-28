PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_serial_feed_categories` (
	`feed_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	PRIMARY KEY(`feed_id`, `category_id`),
	FOREIGN KEY (`feed_id`) REFERENCES `serial_feed`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `serial_content_categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_serial_feed_categories`("feed_id", "category_id") SELECT "feed_id", "category_id" FROM `serial_feed_categories`;--> statement-breakpoint
DROP TABLE `serial_feed_categories`;--> statement-breakpoint
ALTER TABLE `__new_serial_feed_categories` RENAME TO `serial_feed_categories`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_serial_view_categories` (
	`view_id` integer,
	`category_id` integer,
	PRIMARY KEY(`view_id`, `category_id`),
	FOREIGN KEY (`view_id`) REFERENCES `serial_views`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `serial_content_categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_serial_view_categories`("view_id", "category_id") SELECT "view_id", "category_id" FROM `serial_view_categories`;--> statement-breakpoint
DROP TABLE `serial_view_categories`;--> statement-breakpoint
ALTER TABLE `__new_serial_view_categories` RENAME TO `serial_view_categories`;--> statement-breakpoint
CREATE TABLE `__new_serial_content_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text(256) NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `serial_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_serial_content_categories`("id", "user_id", "name", "created_at", "updated_at") SELECT "id", "user_id", "name", "created_at", "updated_at" FROM `serial_content_categories`;--> statement-breakpoint
DROP TABLE `serial_content_categories`;--> statement-breakpoint
ALTER TABLE `__new_serial_content_categories` RENAME TO `serial_content_categories`;--> statement-breakpoint
CREATE INDEX `content_categories_name_idx` ON `serial_content_categories` (`name`);--> statement-breakpoint
CREATE TABLE `__new_serial_feed` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text(256) DEFAULT '' NOT NULL,
	`url` text(512) DEFAULT '' NOT NULL,
	`image_url` text(512) DEFAULT '' NOT NULL,
	`platform` text(256) DEFAULT 'youtube' NOT NULL,
	`open_location` text(64) DEFAULT 'serial' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `serial_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_serial_feed`("id", "user_id", "name", "url", "image_url", "platform", "open_location", "created_at", "updated_at") SELECT "id", "user_id", "name", "url", "image_url", "platform", "open_location", "created_at", "updated_at" FROM `serial_feed`;--> statement-breakpoint
DROP TABLE `serial_feed`;--> statement-breakpoint
ALTER TABLE `__new_serial_feed` RENAME TO `serial_feed`;--> statement-breakpoint
CREATE INDEX `feed_name_idx` ON `serial_feed` (`name`);--> statement-breakpoint
CREATE TABLE `__new_serial_user_config` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`light_hsl` text(16) DEFAULT '' NOT NULL,
	`dark_hsl` text(16) DEFAULT '' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `serial_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_serial_user_config`("id", "user_id", "created_at", "updated_at", "light_hsl", "dark_hsl") SELECT "user_id", "user_id", "created_at", "updated_at", "light_hsl", "dark_hsl" FROM `serial_user_config`;--> statement-breakpoint
DROP TABLE `serial_user_config`;--> statement-breakpoint
ALTER TABLE `__new_serial_user_config` RENAME TO `serial_user_config`;--> statement-breakpoint
CREATE UNIQUE INDEX `serial_user_config_user_id_unique` ON `serial_user_config` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_serial_views` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text(256) DEFAULT '' NOT NULL,
	`days_window` integer DEFAULT 1 NOT NULL,
	`read_status` integer DEFAULT 0 NOT NULL,
	`orientation` text(16) DEFAULT 'horizontal' NOT NULL,
	`placement` integer DEFAULT -1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `serial_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_serial_views`("id", "user_id", "name", "days_window", "read_status", "orientation", "placement", "created_at", "updated_at") SELECT "id", "user_id", "name", "days_window", "read_status", "orientation", "placement", "created_at", "updated_at" FROM `serial_views`;--> statement-breakpoint
DROP TABLE `serial_views`;--> statement-breakpoint
ALTER TABLE `__new_serial_views` RENAME TO `serial_views`;--> statement-breakpoint
CREATE INDEX `view_name_idx` ON `serial_views` (`name`);