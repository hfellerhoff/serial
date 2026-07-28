PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_serial_feed_categories` (
	`feed_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	PRIMARY KEY(`feed_id`, `category_id`),
	FOREIGN KEY (`feed_id`) REFERENCES `serial_feed`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `serial_content_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_serial_feed_categories`("feed_id", "category_id") SELECT "feed_id", "category_id" FROM `serial_feed_categories`;--> statement-breakpoint
DROP TABLE `serial_feed_categories`;--> statement-breakpoint
ALTER TABLE `__new_serial_feed_categories` RENAME TO `serial_feed_categories`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_serial_feed_item` (
	`id` text PRIMARY KEY NOT NULL,
	`feed_id` integer NOT NULL,
	`content_id` text(512) NOT NULL,
	`title` text(512) NOT NULL,
	`author` text(512) NOT NULL,
	`url` text(512) NOT NULL,
	`thumbnail` text(512) DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`is_watched` integer DEFAULT false NOT NULL,
	`is_watch_later` integer DEFAULT false NOT NULL,
	`orientation` text(64),
	`posted_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `serial_feed`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_serial_feed_item`("id", "feed_id", "content_id", "title", "author", "url", "thumbnail", "content", "is_watched", "is_watch_later", "orientation", "posted_at", "created_at", "updated_at") SELECT "id", "feed_id", "content_id", "title", "author", "url", "thumbnail", "content", "is_watched", "is_watch_later", "orientation", "posted_at", "created_at", "updated_at" FROM `serial_feed_item`;--> statement-breakpoint
DROP TABLE `serial_feed_item`;--> statement-breakpoint
ALTER TABLE `__new_serial_feed_item` RENAME TO `serial_feed_item`;--> statement-breakpoint
CREATE INDEX `feed_item_id_idx` ON `serial_feed_item` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `serial_feed_item_url_feed_id_unique` ON `serial_feed_item` (`url`,`feed_id`);