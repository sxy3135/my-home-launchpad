DROP INDEX `reader_inbox_candidates`;--> statement-breakpoint
CREATE INDEX `reader_inbox_candidates` ON `reader_documents` (`observed_at`) WHERE "reader_documents"."item" IS NOT NULL;