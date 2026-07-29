CREATE TABLE `serial_jwks` (
	`id` text PRIMARY KEY NOT NULL,
	`public_key` text NOT NULL,
	`private_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer
);
--> statement-breakpoint
CREATE TABLE `serial_oauth_access_token` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text,
	`reference_id` text,
	`refresh_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`scopes` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `serial_oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `serial_session`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `serial_user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`refresh_id`) REFERENCES `serial_oauth_refresh_token`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `serial_oauth_access_token_token_unique` ON `serial_oauth_access_token` (`token`);--> statement-breakpoint
CREATE INDEX `oauth_access_token_client_id_idx` ON `serial_oauth_access_token` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauth_access_token_session_id_idx` ON `serial_oauth_access_token` (`session_id`);--> statement-breakpoint
CREATE INDEX `oauth_access_token_user_id_idx` ON `serial_oauth_access_token` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauth_access_token_refresh_id_idx` ON `serial_oauth_access_token` (`refresh_id`);--> statement-breakpoint
CREATE TABLE `serial_oauth_client` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`client_secret` text,
	`disabled` integer DEFAULT false,
	`skip_consent` integer,
	`enable_end_session` integer,
	`subject_type` text,
	`scopes` text,
	`user_id` text,
	`created_at` integer,
	`updated_at` integer,
	`name` text,
	`uri` text,
	`icon` text,
	`contacts` text,
	`tos` text,
	`policy` text,
	`software_id` text,
	`software_version` text,
	`software_statement` text,
	`redirect_uris` text NOT NULL,
	`post_logout_redirect_uris` text,
	`token_endpoint_auth_method` text,
	`grant_types` text,
	`response_types` text,
	`public` integer,
	`type` text,
	`require_pkce` integer,
	`reference_id` text,
	`metadata` text,
	FOREIGN KEY (`user_id`) REFERENCES `serial_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `serial_oauth_client_client_id_unique` ON `serial_oauth_client` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauth_client_user_id_idx` ON `serial_oauth_client` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauth_client_reference_id_idx` ON `serial_oauth_client` (`reference_id`);--> statement-breakpoint
CREATE TABLE `serial_oauth_consent` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text,
	`reference_id` text,
	`scopes` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `serial_oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `serial_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauth_consent_client_id_idx` ON `serial_oauth_consent` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauth_consent_user_id_idx` ON `serial_oauth_consent` (`user_id`);--> statement-breakpoint
CREATE TABLE `serial_oauth_refresh_token` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`client_id` text NOT NULL,
	`session_id` text,
	`user_id` text NOT NULL,
	`reference_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked` integer,
	`auth_time` integer,
	`scopes` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `serial_oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `serial_session`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `serial_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `serial_oauth_refresh_token_token_unique` ON `serial_oauth_refresh_token` (`token`);--> statement-breakpoint
CREATE INDEX `oauth_refresh_token_client_id_idx` ON `serial_oauth_refresh_token` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauth_refresh_token_session_id_idx` ON `serial_oauth_refresh_token` (`session_id`);--> statement-breakpoint
CREATE INDEX `oauth_refresh_token_user_id_idx` ON `serial_oauth_refresh_token` (`user_id`);
