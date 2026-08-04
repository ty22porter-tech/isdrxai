import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { prospectsTable } from "./prospects";
import { campaignsTable } from "./campaigns";

export const emailsTable = pgTable("emails", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull().default(""),
  prospectId: integer("prospect_id").notNull().references(() => prospectsTable.id, { onDelete: "cascade" }),
  campaignId: integer("campaign_id").references(() => campaignsTable.id, { onDelete: "set null" }),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("sent"),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  openedAt: timestamp("opened_at"),
  repliedAt: timestamp("replied_at"),
  /** Unguessable token embedded in the tracking pixel / tracked-link URLs. */
  trackingToken: text("tracking_token").notNull().unique().default(sql`gen_random_uuid()::text`),
  /** Resend message id — lets delivery webhooks (delivered/bounced) find this row. */
  resendId: text("resend_id"),
  deliveredAt: timestamp("delivered_at"),
  bouncedAt: timestamp("bounced_at"),
  totalOpens: integer("total_opens").notNull().default(0),
  validOpens: integer("valid_opens").notNull().default(0),
  lastOpenedAt: timestamp("last_opened_at"),
});

export const insertEmailSchema = createInsertSchema(emailsTable).omit({ id: true, sentAt: true, clientId: true });
export type InsertEmail = z.infer<typeof insertEmailSchema>;
export type Email = typeof emailsTable.$inferSelect;
