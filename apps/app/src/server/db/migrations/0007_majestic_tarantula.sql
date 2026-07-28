CREATE TABLE `serial_feed_item` (
	`feed_id` integer,
	`content_id` text(512) NOT NULL,
	`title` text(512) NOT NULL,
	`author` text(512) NOT NULL,
	`url` text(512) NOT NULL,
	`thumbnail` text(512) DEFAULT '' NOT NULL,
	`is_watched` integer DEFAULT false NOT NULL,
	`is_hidden` integer DEFAULT false NOT NULL,
	`posted_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`content_id`, `feed_id`),
	FOREIGN KEY (`feed_id`) REFERENCES `serial_feed`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `feed_item_feed_id_idx` ON `serial_feed_item` (`feed_id`);