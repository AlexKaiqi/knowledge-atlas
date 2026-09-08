CREATE TABLE `ws_environment_members` (
	`environment` text NOT NULL,
	`actor` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`environment`, `actor`),
	FOREIGN KEY (`environment`) REFERENCES `ws_environments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor`) REFERENCES `ws_actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ws_environment_versions` (
	`environment` text NOT NULL,
	`version` integer NOT NULL,
	`purpose` text NOT NULL,
	`files` text NOT NULL,
	`reason` text NOT NULL,
	`actor` text NOT NULL,
	`shared_at` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`environment`, `version`),
	FOREIGN KEY (`environment`) REFERENCES `ws_environments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor`) REFERENCES `ws_actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ws_environments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`source_environment` text,
	`source_version` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `ws_actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ws_environments_visibility_updated` ON `ws_environments` (`visibility`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_ws_environments_owner_updated` ON `ws_environments` (`owner`,`updated_at`);