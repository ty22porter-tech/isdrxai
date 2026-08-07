import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const prospectsTable = pgTable("prospects", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull().default(""),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  industry: text("industry").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  website: text("website"),
  notes: text("notes"),
  employeeCount: integer("employee_count"),
  squareFootage: integer("square_footage"),
  vertical: text("vertical"),
  status: text("status").notNull().default("new"),
  scheduleToken: text("schedule_token").notNull().unique().default(sql`gen_random_uuid()::text`),
  unsubscribeToken: text("unsubscribe_token").notNull().unique().default(sql`gen_random_uuid()::text`),
  replyToken: text("reply_token").notNull().unique().default(sql`gen_random_uuid()::text`),
  /** System engagement score (sum of score_events points). */
  engagementScore: integer("engagement_score").notNull().default(0),
  /** Interest level computed from the score + thresholds: "low" | "medium" | "hot". */
  interestLevel: text("interest_level").notNull().default("low"),
  /** Manual override set by the client; preserved alongside the system score. */
  manualInterestLevel: text("manual_interest_level"),
  manualInterestSetAt: timestamp("manual_interest_set_at"),
  /** Contact's job title, filled by Apollo people enrichment. */
  title: text("title"),
  /** Contact's LinkedIn profile URL, filled by Apollo people enrichment. */
  linkedinUrl: text("linkedin_url"),
  /** When Apollo enrichment last succeeded for this prospect. */
  enrichedAt: timestamp("enriched_at"),
  /** Flag surfaced in Hot alerts — no automation attached (out of scope). */
  linkedinOutreach: boolean("linkedin_outreach").notNull().default(false),
  optedOut: boolean("opted_out").notNull().default(false),
  optedOutAt: timestamp("opted_out_at"),
  lastContactedAt: timestamp("last_contacted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProspectSchema = createInsertSchema(prospectsTable).omit({ id: true, createdAt: true, clientId: true });
export type InsertProspect = z.infer<typeof insertProspectSchema>;
export type Prospect = typeof prospectsTable.$inferSelect;
