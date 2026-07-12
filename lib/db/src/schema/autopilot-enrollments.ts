import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { prospectsTable } from "./prospects";
import { campaignsTable } from "./campaigns";

export const autopilotEnrollmentsTable = pgTable("autopilot_enrollments", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull(),
  campaignId: integer("campaign_id").references(() => campaignsTable.id, { onDelete: "cascade" }),
  prospectId: integer("prospect_id").notNull().references(() => prospectsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("active"),
  currentStep: integer("current_step").notNull().default(0),
  nextSendAt: timestamp("next_send_at"),
  lastEmailSentAt: timestamp("last_email_sent_at"),
  repliedAt: timestamp("replied_at"),
  replyContent: text("reply_content"),
  replyTone: text("reply_tone"),
  calendlyLinkSentAt: timestamp("calendly_link_sent_at"),
  bookedAt: timestamp("booked_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AutopilotEnrollment = typeof autopilotEnrollmentsTable.$inferSelect;
