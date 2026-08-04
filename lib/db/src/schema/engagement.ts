import { pgTable, text, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Interest-scoring + engagement-automation tables.
 *
 * score_events is the source of truth for a prospect's system engagement
 * score: score = sum(points). Each row records why points were awarded so
 * the history is auditable (spec: "score history with reasons"). Manual
 * overrides are also recorded here (points = 0, eventType = "manual_override").
 */
export const scoreEventsTable = pgTable("score_events", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull().default(""),
  prospectId: integer("prospect_id").notNull(),
  emailId: integer("email_id"),
  /** open | link_click | attachment_view | calendly_click | questionnaire_opened | questionnaire_submitted | positive_reply | meeting_scheduled | manual_override */
  eventType: text("event_type").notNull(),
  points: integer("points").notNull().default(0),
  reason: text("reason").notNull().default(""),
  /** System score AFTER this event was applied. */
  scoreAfter: integer("score_after").notNull().default(0),
  /** Computed interest level after this event ("low" | "medium" | "hot"). */
  interestLevelAfter: text("interest_level_after").notNull().default("low"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Queue + audit trail for engagement-triggered automations (the repeated-open
 * meeting-request follow-up). The unique index over
 * (prospect, campaignKey, automationType) is the DB idempotency key that
 * guarantees at most ONE meeting-request send per prospect per campaign.
 * campaignKey is the campaign id, or 0 for emails sent outside a campaign.
 */
export const automationRunsTable = pgTable("automation_runs", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull().default(""),
  prospectId: integer("prospect_id").notNull(),
  campaignKey: integer("campaign_key").notNull().default(0),
  automationType: text("automation_type").notNull().default("meeting_request"),
  /** pending | sending | sent | suppressed | failed */
  status: text("status").notNull().default("pending"),
  /** Why the run was created (e.g. "3rd valid open"). */
  triggerReason: text("trigger_reason").notNull().default(""),
  /** Valid-open count for this prospect at trigger time. */
  validOpensAtTrigger: integer("valid_opens_at_trigger").notNull().default(0),
  scheduledFor: timestamp("scheduled_for").notNull().defaultNow(),
  sentAt: timestamp("sent_at"),
  /** emails.id of the sent meeting-request email. */
  emailId: integer("email_id"),
  /** Suppression / failure detail for the audit record. */
  resultDetail: text("result_detail"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("automation_runs_idempotency_idx").on(t.prospectId, t.campaignKey, t.automationType),
]);

/** Persistent in-app notifications (e.g. "prospect became Hot"). */
export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull().default(""),
  type: text("type").notNull().default("info"),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  prospectId: integer("prospect_id"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ScoreEvent = typeof scoreEventsTable.$inferSelect;
export type AutomationRun = typeof automationRunsTable.$inferSelect;
export type Notification = typeof notificationsTable.$inferSelect;
