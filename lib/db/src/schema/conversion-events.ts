import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Privacy-safe marketing and billing funnel events. CTA clicks contain only an
 * anonymous browser ID; server-side outcomes may reference an authenticated user.
 */
export const conversionEventsTable = pgTable("conversion_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  intent: text("intent").notNull(),
  location: text("location").notNull().default("unknown"),
  visitorId: text("visitor_id"),
  userId: text("user_id"),
  sourceKey: text("source_key").notNull().unique(),
  metadata: jsonb("metadata").$type<Record<string, string | number | boolean>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ConversionEvent = typeof conversionEventsTable.$inferSelect;