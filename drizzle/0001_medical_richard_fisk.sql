CREATE TABLE `observations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`target` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`data` text NOT NULL,
	`recorded_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_observations_owner_recorded` ON `observations` (`owner`,`recorded_at`);