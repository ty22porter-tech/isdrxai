import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),
  type: text("type").notNull().default("email"),
  targetIndustry: text("target_industry").notNull(),
  description: text("description"),
  emailTemplate: text("email_template"),
  callScript: text("call_script"),
  prospectCount: integer("prospect_count").notNull().default(0),
  emailsSent: integer("emails_sent").notNull().default(0),
  callsMade: integer("calls_made").notNull().default(0),
  appointmentsSet: integer("appointments_set").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({ id: true, createdAt: true });
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;
