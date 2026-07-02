import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Dedup ledger for inbound (received) emails. Resend can retry/replay the same
// email.received webhook event; recording each processed email_id lets the
// handler stay idempotent and avoid duplicate reply processing / scheduling sends.
export const processedInboundEmailsTable = pgTable("processed_inbound_emails", {
  emailId: text("email_id").primaryKey(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ProcessedInboundEmail = typeof processedInboundEmailsTable.$inferSelect;
