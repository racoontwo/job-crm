CREATE TABLE `saved_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`shared_text` text,
	`status` text DEFAULT 'new' NOT NULL,
	`application_id` integer,
	`received_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE set null
);
