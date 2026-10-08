// Backend-agnostic shapes returned by lib/actions/actions.ts, regardless of
// whether the data came from local SQLite or Mongo. IDs are always strings —
// SQLite's numeric ids get stringified, Mongo's ObjectIds are already strings
// once serialized — so pages/components never need to know which backend
// answered the query.

export type CompanySummary = {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  notes: string | null;
  interestLevel: number;
};

export type StatusEventSummary = {
  id: string;
  status: string;
  note: string | null;
  eventDate: string;
};

export type FollowUpSummary = {
  id: string;
  dueDate: string;
  note: string | null;
  done: boolean;
};

export type ApplicationSummary = {
  id: string;
  roleTitle: string;
  roleDescription: string | null;
  coverLetter: string | null;
  source: string | null;
  appliedDate: string;
  currentStatus: string;
  jobUrl: string | null;
  createdAt: string;
  company: CompanySummary;
  statusEvents: StatusEventSummary[];
  followUps: FollowUpSummary[];
};

export type DashboardApplication = ApplicationSummary & {
  daysSinceUpdate: number | null;
  openFollowUps: FollowUpSummary[];
};
