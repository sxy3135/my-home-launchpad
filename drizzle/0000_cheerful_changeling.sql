CREATE TABLE `reader_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`item` text,
	`state_at` integer NOT NULL,
	`observed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reader_inbox_candidates` ON `reader_documents` (`item`);--> statement-breakpoint
CREATE TABLE `reader_state` (
	`key` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`initialized` integer DEFAULT 0 NOT NULL,
	`stale` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`lock_owner` text,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`cooldown_until` integer DEFAULT 0 NOT NULL,
	`api_window` integer DEFAULT 0 NOT NULL,
	`api_count` integer DEFAULT 0 NOT NULL,
	`stage` text
);
