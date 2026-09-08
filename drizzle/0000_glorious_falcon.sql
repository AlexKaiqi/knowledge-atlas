CREATE TABLE `discussions` (
	`id` text PRIMARY KEY NOT NULL,
	`target` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`nickname` text NOT NULL,
	`owner` text NOT NULL,
	`parent` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_discussions_target_created` ON `discussions` (`target`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_discussions_parent` ON `discussions` (`parent`);--> statement-breakpoint
CREATE TABLE `notes` (
	`owner` text NOT NULL,
	`target` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`data` text NOT NULL,
	`stage` text NOT NULL,
	`review_at` integer,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner`, `target`)
);
--> statement-breakpoint
CREATE INDEX `idx_notes_owner_review` ON `notes` (`owner`,`review_at`);--> statement-breakpoint
CREATE TABLE `revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`target` text NOT NULL,
	`base_version` integer NOT NULL,
	`field` text NOT NULL,
	`before_text` text NOT NULL,
	`after_text` text NOT NULL,
	`reason` text NOT NULL,
	`sources` text NOT NULL,
	`nickname` text NOT NULL,
	`owner` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_revisions_target_created` ON `revisions` (`target`,`created_at`);