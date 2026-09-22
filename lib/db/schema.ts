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
  source: text("source"), // e.g. LinkedIn, referral, direct, job board
  appliedDate: text("applied_date").notNull(),
  currentStatus: text("current_status").notNull().default("Applied"),
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
  status: text("status").notNull(), // Applied, Screening, Interviewing, Offer, Rejected, Withdrawn (free text, extensible)
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
  "Applied",
  "Screening",
  "Interviewing",
  "Offer",
  "Rejected",
  "Withdrawn",
] as const;

export type StatusStage = (typeof STATUS_STAGES)[number];
