ALTER TABLE serial_feed_item ADD `author` text(512) NOT NULL;
--> statement-breakpoint
ALTER TABLE serial_feed_item ADD `posted_at` integer NOT NULL;