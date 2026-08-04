import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { emailsTable } from "./emails";

/**
 * Engagement tracking events. All rows are written by the public tracking
 * endpoints (pixel / redirect), keyed by the email's unguessable trackingToken,
 * and scoped by clientId for tenant isolation on read.
 */

export const emailOpenEventsTable = pgTable("email_open_events", {
  id: serial("id").primaryKey(),
  emailId: integer("email_id").notNull().references(() => emailsTable.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull().default(""),
  prospectId: integer("prospect_id").notNull(),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  /** Heuristically flagged as automated (proxy/scanner/prefetch) rather than human. */
  isBot: boolean("is_bot").notNull().default(false),
  botReason: text("bot_reason"),
  /** Counted toward validOpens (non-bot AND outside the dedup window). */
  isValid: boolean("is_valid").notNull().default(false),
});

/**
 * The tracked links embedded in a specific outbound email. The redirect
 * endpoint only ever sends the visitor to a destination stored here, which
 * eliminates open-redirect risk. kind: "cta" | "website" | "attachment".
 * For attachments, destination is the object-storage path ("/objects/...").
 */
export const emailLinksTable = pgTable("email_links", {
  id: serial("id").primaryKey(),
  emailId: integer("email_id").notNull().references(() => emailsTable.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull().default(""),
  prospectId: integer("prospect_id").notNull(),
  kind: text("kind").notNull(),
  /** Slug used in the tracked URL (unique per email): "cta", "website", "att0"... */
  slug: text("slug").notNull(),
  name: text("name"),
  destination: text("destination").notNull(),
  clickCount: integer("click_count").notNull().default(0),
  downloadCount: integer("download_count").notNull().default(0),
  lastClickedAt: timestamp("last_clicked_at"),
});

export const linkClickEventsTable = pgTable("link_click_events", {
  id: serial("id").primaryKey(),
  linkId: integer("link_id").notNull().references(() => emailLinksTable.id, { onDelete: "cascade" }),
  emailId: integer("email_id").notNull(),
  clientId: text("client_id").notNull().default(""),
  prospectId: integer("prospect_id").notNull(),
  /** "click" for link/attachment views, "download" for attachment downloads. */
  eventType: text("event_type").notNull().default("click"),
  clickedAt: timestamp("clicked_at").notNull().defaultNow(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  isBot: boolean("is_bot").notNull().default(false),
});

export type EmailOpenEvent = typeof emailOpenEventsTable.$inferSelect;
export type EmailLink = typeof emailLinksTable.$inferSelect;
export type LinkClickEvent = typeof linkClickEventsTable.$inferSelect;
