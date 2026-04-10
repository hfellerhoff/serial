CREATE TABLE `serial_view_feeds` (
	`view_id` integer NOT NULL,
	`feed_id` integer NOT NULL,
	PRIMARY KEY(`view_id`, `feed_id`),
	FOREIGN KEY (`view_id`) REFERENCES `serial_views`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`feed_id`) REFERENCES `serial_feed`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `view_feeds_view_id_idx` ON `serial_view_feeds` (`view_id`);--> statement-breakpoint
CREATE INDEX `view_feeds_feed_id_idx` ON `serial_view_feeds` (`feed_id`);