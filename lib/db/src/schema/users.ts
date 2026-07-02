import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status").notNull().default("trialing"),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  businessName: text("business_name"),
  senderName: text("sender_name"),
  phone: text("phone"),
  businessAddress: text("business_address"),
  outreachEmail: text("outreach_email"),
  sendingEmail: text("sending_email"),
  calendlyUrl: text("calendly_url"),
  timezone: text("timezone").default("America/New_York"),
  autopilotEnabled: boolean("autopilot_enabled").notNull().default(false),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
