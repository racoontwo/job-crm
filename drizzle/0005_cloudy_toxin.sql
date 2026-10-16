CREATE TABLE `cover_letter_drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_id` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`provider` text NOT NULL,
	`model` text,
	`letter` text,
	`error` text,
	`prompt` text,
	`example_count` integer,
	`created_at` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `profile_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`content` text NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
