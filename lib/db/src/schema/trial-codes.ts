import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const trialCodesTable = pgTable("trial_codes", {
  code: text("code").primaryKey(),
  label: text("label"),
  trialDays: integer("trial_days").notNull().default(14),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  redeemedBy: text("redeemed_by"),
  redeemedAt: timestamp("redeemed_at"),
});

export type TrialCode = typeof trialCodesTable.$inferSelect;
