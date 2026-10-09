import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  website: text("website"),
  industry: text("industry"),
  notes: text("notes"),
  interestLevel: integer("interest_level").notNull().default(3), // 1 (low) - 5 (high)
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const applications = sqliteTable("applications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  roleTitle: text("role_title").notNull(),
  roleDescription: text("role_description"),
  coverLetter: text("cover_letter"),
  source: text("source"), // e.g. LinkedIn, referral, direct, job board
  appliedDate: text("applied_date"), // null until you actually apply (status "To apply")
  currentStatus: text("current_status").notNull().default("To apply"),
  jobUrl: text("job_url"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const statusEvents = sqliteTable("status_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationId: integer("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // To apply, Applied, Screening, Interviewing, Offer, Rejected, Withdrawn (free text, extensible)
  note: text("note"),
  eventDate: text("event_date").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const followUps = sqliteTable("follow_ups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationId: integer("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  dueDate: text("due_date").notNull(),
  note: text("note"),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

// Step 1 of the new-application flow: a link shared from the phone (or
// pasted here) waiting to be fetched. Becomes "done" once an application is
// saved from it, or "dismissed" if it's not worth applying to.
export const savedLinks = sqliteTable("saved_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url").notNull(),
  sharedText: text("shared_text"), // whatever the share menu sent alongside the URL
  status: text("status").notNull().default("new"), // new | done | dismissed
  applicationId: integer("application_id").references(() => applications.id, {
    onDelete: "set null",
  }),
  receivedAt: text("received_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

// What the cover-letter generator knows about you: resume, writing rules,
// extra notes and past letters. Used to be files under profile/; kept as
// name + content so uploads keep their filenames.
export const profileDocuments = sqliteTable("profile_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(), // resume | writingStyle | note | example
  name: text("name").notNull(), // e.g. resume.md, interests.md
  content: text("content").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

// Every cover-letter generation, kept as history. Runs in the background:
// queued → generating → ready | failed.
export const coverLetterDrafts = sqliteTable("cover_letter_drafts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationId: integer("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("queued"),
  provider: text("provider").notNull(), // claude | gemini
  model: text("model"),
  letter: text("letter"),
  error: text("error"),
  prompt: text("prompt"), // exactly what was sent, for comparing drafts
  exampleCount: integer("example_count"),
  createdAt: text("created_at").notNull(),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
});

// Relations
export const companiesRelations = relations(companies, ({ many }) => ({
  applications: many(applications),
}));

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  company: one(companies, {
    fields: [applications.companyId],
    references: [companies.id],
  }),
  statusEvents: many(statusEvents),
  followUps: many(followUps),
}));

export const statusEventsRelations = relations(statusEvents, ({ one }) => ({
  application: one(applications, {
    fields: [statusEvents.applicationId],
    references: [applications.id],
  }),
}));

export const followUpsRelations = relations(followUps, ({ one }) => ({
  application: one(applications, {
    fields: [followUps.applicationId],
    references: [applications.id],
  }),
}));

export const STATUS_STAGES = [
  "To apply",
  "Applied",
  "Screening",
  "Interviewing",
  "Offer",
  "Rejected",
  "Withdrawn",
] as const;

export type StatusStage = (typeof STATUS_STAGES)[number];
