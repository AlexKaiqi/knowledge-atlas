CREATE TABLE `ws_actors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`preferences` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ws_artifact_versions` (
	`artifact` text NOT NULL,
	`version` integer NOT NULL,
	`body` text NOT NULL,
	`metadata` text NOT NULL,
	`actor` text NOT NULL,
	`source_message` text,
	`job` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`artifact`, `version`),
	FOREIGN KEY (`artifact`) REFERENCES `ws_artifacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor`) REFERENCES `ws_actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ws_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`space` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`space`) REFERENCES `ws_explorations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ws_document_versions` (
	`document` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`metadata` text NOT NULL,
	`reason` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`document`, `version`),
	FOREIGN KEY (`document`) REFERENCES `ws_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor`) REFERENCES `ws_actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ws_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer NOT NULL,
	`source_artifact` text NOT NULL,
	`source_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `ws_actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ws_explorations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `ws_actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ws_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`space` text NOT NULL,
	`actor` text NOT NULL,
	`runner` text NOT NULL,
	`input` text NOT NULL,
	`status` text NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`lease` text,
	`lease_until` integer,
	`error` text,
	`artifact` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`space`) REFERENCES `ws_explorations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor`) REFERENCES `ws_actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ws_jobs_status_lease` ON `ws_jobs` (`status`,`lease_until`);--> statement-breakpoint
CREATE TABLE `ws_members` (
	`space` text NOT NULL,
	`actor` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`space`, `actor`),
	FOREIGN KEY (`space`) REFERENCES `ws_explorations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor`) REFERENCES `ws_actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ws_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`space` text NOT NULL,
	`actor` text NOT NULL,
	`body` text NOT NULL,
	`client_id` text NOT NULL,
	`digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`space`) REFERENCES `ws_explorations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor`) REFERENCES `ws_actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ws_messages_space_time` ON `ws_messages` (`space`,`created_at`);--> statement-breakpoint
CREATE TABLE `ws_relations` (
	`document` text NOT NULL,
	`version` integer NOT NULL,
	`target` text NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	PRIMARY KEY(`document`, `version`, `target`, `kind`),
	FOREIGN KEY (`document`) REFERENCES `ws_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ws_requests` (
	`actor` text NOT NULL,
	`key` text NOT NULL,
	`digest` text NOT NULL,
	`response` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`actor`, `key`)
);
