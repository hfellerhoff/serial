CREATE TABLE `serial_invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`inviter_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`max_uses` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`inviter_id`) REFERENCES `serial_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `serial_invitation_token_unique` ON `serial_invitation` (`token`);--> statement-breakpoint
CREATE INDEX `invitation_inviter_id_idx` ON `serial_invitation` (`inviter_id`);--> statement-breakpoint
CREATE TABLE `serial_invitation_redemption` (
	`id` text PRIMARY KEY NOT NULL,
	`invitation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `serial_invitation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `serial_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invitation_redemption_invitation_id_idx` ON `serial_invitation_redemption` (`invitation_id`);