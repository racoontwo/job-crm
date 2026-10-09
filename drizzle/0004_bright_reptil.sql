PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`role_title` text NOT NULL,
	`role_description` text,
	`cover_letter` text,
	`source` text,
	`applied_date` text,
	`current_status` text DEFAULT 'To apply' NOT NULL,
	`job_url` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_applications`("id", "company_id", "role_title", "role_description", "cover_letter", "source", "applied_date", "current_status", "job_url", "created_at") SELECT "id", "company_id", "role_title", "role_description", "cover_letter", "source", "applied_date", "current_status", "job_url", "created_at" FROM `applications`;--> statement-breakpoint
DROP TABLE `applications`;--> statement-breakpoint
ALTER TABLE `__new_applications` RENAME TO `applications`;--> statement-breakpoint
PRAGMA foreign_keys=ON;