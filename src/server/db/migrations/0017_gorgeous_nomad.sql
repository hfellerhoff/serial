PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_serial_feed_item` (
	`id` text PRIMARY KEY NOT NULL,
	`feed_id` integer,
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
	FOREIGN KEY (`feed_id`) REFERENCES `serial_feed`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_serial_feed_item`("id", "feed_id", "content_id", "title", "author", "url", "thumbnail", "content", "is_watched", "is_watch_later", "orientation", "posted_at", "created_at", "updated_at") SELECT "id", "feed_id", "content_id", "title", "author", "url", "thumbnail", "content", "is_watched", "is_watch_later", "orientation", "posted_at", "created_at", "updated_at" FROM `serial_feed_item`;--> statement-breakpoint
DROP TABLE `serial_feed_item`;--> statement-breakpoint
ALTER TABLE `__new_serial_feed_item` RENAME TO `serial_feed_item`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `feed_item_id_idx` ON `serial_feed_item` (`id`);