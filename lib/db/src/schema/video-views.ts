import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const videoViewsTable = pgTable("video_views", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull(),
  ref: text("ref").notNull(),
  event: text("event").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type VideoView = typeof videoViewsTable.$inferSelect;
