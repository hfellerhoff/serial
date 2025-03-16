PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_serial_feed_item` (
	`feed_id` integer,
	`content_id` text(512) NOT NULL,
	`title` text(512) NOT NULL,
	`author` text(512) NOT NULL,
	`url` text(512) NOT NULL,
	`thumbnail` text(512) DEFAULT '' NOT NULL,
	`is_watched` integer DEFAULT false NOT NULL,
	`is_watch_later` integer DEFAULT false NOT NULL,
	`is_vertical` integer DEFAULT false NOT NULL,
	`posted_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`feed_id`, `content_id`),
	FOREIGN KEY (`feed_id`) REFERENCES `serial_feed`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_serial_feed_item`("feed_id", "content_id", "title", "author", "url", "thumbnail", "is_watched", "is_watch_later", "is_vertical", "posted_at", "created_at", "updated_at") SELECT "feed_id", "content_id", "title", "author", "url", "thumbnail", "is_watched", "is_watch_later", "is_vertical", "posted_at", "created_at", "updated_at" FROM `serial_feed_item`;--> statement-breakpoint
DROP TABLE `serial_feed_item`;--> statement-breakpoint
ALTER TABLE `__new_serial_feed_item` RENAME TO `serial_feed_item`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `feed_item_feed_id_idx` ON `serial_feed_item` (`feed_id`);--> statement-breakpoint
CREATE TABLE `__new_serial_feed_categories` (
	`feed_id` integer,
	`category_id` integer,
	PRIMARY KEY(`feed_id`, `category_id`),
	FOREIGN KEY (`feed_id`) REFERENCES `serial_feed`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `serial_content_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_serial_feed_categories`("feed_id", "category_id") SELECT "feed_id", "category_id" FROM `serial_feed_categories`;--> statement-breakpoint
DROP TABLE `serial_feed_categories`;--> statement-breakpoint
ALTER TABLE `__new_serial_feed_categories` RENAME TO `serial_feed_categories`;