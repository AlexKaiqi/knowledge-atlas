ALTER TABLE `ws_jobs` ADD `progress` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `ws_jobs` ADD `progress_version` integer DEFAULT 0 NOT NULL;