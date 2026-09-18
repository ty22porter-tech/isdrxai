import { pgTable, text, serial, integer, boolean, timestamp, date, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export interface GiftOutreachSettings {
  enabled: boolean;
  defaultMethod: "email" | "video" | "per_prospect";
  daysAfterDelivery: number;
  sentOnlyBusinessDays: number;
  industry: string;
  serviceDescriptions: string;
  discussionPoints: string;
  schedulingLink: string;
  emailSignature: string;
  videoHostingPreference: "managed";
  videoCta: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  timezone: string;
  allowedDays: number[];
  automationLevel: "auto" | "review" | "manual";
  videoFallback: "pause" | "email";
  maxFollowUpAttempts: number;
}

export const giftOutreachSettingsTable = pgTable("gift_outreach_settings", {
  clientId: text("client_id").primaryKey(),
  settings: jsonb("settings").$type<GiftOutreachSettings>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export interface GiftSendPayload {
  fromName: string; fromEmail?: string; replyTo: string; to: string;
  subject: string; body: string; html: string; headers: Record<string, string>;
  trackingToken: string;
  trackedLinks: { kind: string; slug: string; name?: string; destination: string }[];
  videoId: number | null;
}

export const giftOutreachRecordsTable = pgTable("gift_outreach_records", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull(),
  prospectId: integer("prospect_id").notNull(),
  campaignId: integer("campaign_id").notNull(),
  enrollmentId: integer("enrollment_id"),
  enabledSnapshot: boolean("enabled_snapshot").notNull().default(true),
  status: text("status").notNull().default("awaiting_gift"),
  giftSent: boolean("gift_sent").notNull().default(false),
  giftName: text("gift_name").notNull().default(""),
  sentDate: date("sent_date", { mode: "string" }),
  expectedDeliveryDate: date("expected_delivery_date", { mode: "string" }),
  confirmedDeliveryDate: date("confirmed_delivery_date", { mode: "string" }),
  deliverySource: text("delivery_source"),
  carrier: text("carrier").notNull().default(""),
  trackingReference: text("tracking_reference").notNull().default(""),
  amountSpent: text("amount_spent"),
  giftNote: text("gift_note").notNull().default(""),
  preferredName: text("preferred_name").notNull().default(""),
  method: text("method").$type<"email" | "video" | null>(),
  videoId: integer("video_id"),
  complianceRisk: boolean("compliance_risk").notNull().default(false),
  complianceNotes: text("compliance_notes").notNull().default(""),
  draftSubject: text("draft_subject"),
  draftBody: text("draft_body"),
  preparedMethod: text("prepared_method").$type<"email" | "video" | null>(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  revision: integer("revision").notNull().default(1),
  approvedRevision: integer("approved_revision"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: text("approved_by"),
  attempts: integer("attempts").notNull().default(0),
  emailId: integer("email_id"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  firstAttemptAt: timestamp("first_attempt_at", { withTimezone: true }),
  sendPayload: jsonb("send_payload").$type<GiftSendPayload>(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("gift_outreach_prospect_campaign_uq").on(t.clientId, t.prospectId, t.campaignId)]);

export type GiftOutreachRecord = typeof giftOutreachRecordsTable.$inferSelect;

/** Explicit manual sequence dispatch claims, separate from independent one-off emails. */
export const giftManualSequenceStepsTable = pgTable("gift_manual_sequence_steps", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull(),
  prospectId: integer("prospect_id").notNull(),
  campaignId: integer("campaign_id").notNull(),
  originalStep: integer("original_step").notNull(),
  ownerToken: text("owner_token").notNull(),
  status: text("status").notNull().default("claimed"),
  emailId: integer("email_id"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, t => [uniqueIndex("gift_manual_sequence_step_uq").on(t.clientId, t.prospectId, t.campaignId, t.originalStep)]);