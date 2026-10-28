CREATE TABLE `home_login_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `home_security` (
	`id` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`reader_secrets` text
);
