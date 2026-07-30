CREATE TABLE `serial_bookmark_tag` (
	`bookmark_id` text NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`bookmark_id`, `tag_id`),
	FOREIGN KEY (`bookmark_id`) REFERENCES `serial_bookmark`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `serial_content_categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmark_tag_tag_id_idx` ON `serial_bookmark_tag` (`tag_id`);--> statement-breakpoint
CREATE TABLE `serial_bookmark_view` (
	`bookmark_id` text NOT NULL,
	`view_id` integer NOT NULL,
	PRIMARY KEY(`bookmark_id`, `view_id`),
	FOREIGN KEY (`bookmark_id`) REFERENCES `serial_bookmark`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`view_id`) REFERENCES `serial_views`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmark_view_view_id_idx` ON `serial_bookmark_view` (`view_id`);--> statement-breakpoint
CREATE TABLE `serial_bookmark` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_url` text NOT NULL,
	`canonical_url` text NOT NULL,
	`is_saved` integer DEFAULT true NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`duration` integer DEFAULT 0 NOT NULL,
	`saved_updated_at` integer NOT NULL,
	`read_updated_at` integer NOT NULL,
	`progress_updated_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `serial_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmark_user_id_idx` ON `serial_bookmark` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookmark_user_id_canonical_url_unique` ON `serial_bookmark` (`user_id`,`canonical_url`);--> statement-breakpoint
CREATE TABLE `serial_page_capture` (
	`bookmark_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`published_at` integer,
	`content_html` text NOT NULL,
	`effective_url` text NOT NULL,
	`icon_url` text,
	`representative_image_url` text,
	`content_hash` text NOT NULL,
	`capture_source` text NOT NULL,
	`extractor_version` text NOT NULL,
	`sanitizer_policy_version` integer NOT NULL,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`bookmark_id`) REFERENCES `serial_bookmark`(`id`) ON UPDATE no action ON DELETE cascade
);
