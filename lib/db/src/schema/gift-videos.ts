import { boolean, doublePrecision, integer, jsonb, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { prospectsTable } from "./prospects";
import { campaignsTable } from "./campaigns";
import { emailsTable } from "./emails";

/** Reservations bind a newly generated upload to its requesting tenant BEFORE it exists. */
export const giftVideoUploadsTable = pgTable("gift_video_uploads", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull(),
  objectPath: text("object_path").notNull().unique(),
  kind: text("kind").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  claimedAt: timestamp("claimed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const giftVideosTable = pgTable("gift_videos", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull(),
  recordId: integer("record_id").notNull(),
  prospectId: integer("prospect_id").notNull().references(() => prospectsTable.id, { onDelete: "cascade" }),
  campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id, { onDelete: "cascade" }),
  step: integer("step").notNull().default(3),
  emailId: integer("email_id").references(() => emailsTable.id, { onDelete: "set null" }),
  token: text("token").notNull().unique(),
  objectPath: text("object_path").notNull(),
  objectGeneration: text("object_generation").notNull(),
  size: integer("size").notNull(),
  durationSeconds: doublePrecision("duration_seconds").notNull(),
  thumbnailPath: text("thumbnail_path"),
  thumbnailGeneration: text("thumbnail_generation"),
  thumbnailContentType: text("thumbnail_content_type"),
  title: text("title").notNull(),
  prospectName: text("prospect_name").notNull(),
  giftName: text("gift_name").notNull(),
  giftSentDate: text("gift_sent_date").notNull(),
  cta: text("cta").notNull(),
  schedulingLink: text("scheduling_link").notNull(),
  introduction: text("introduction").notNull().default(""),
  transcript: text("transcript").notNull().default(""),
  showNameOnThumbnail: boolean("show_name_on_thumbnail").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, t => [index("gift_videos_client_idx").on(t.clientId)]);

/** Anonymous session scoped to ONE video. No claim that browser activity identifies the recipient. */
export const giftVideoSessionsTable = pgTable("gift_video_sessions", {
  id: text("id").primaryKey(),
  videoId: integer("video_id").notNull().references(() => giftVideosTable.id, { onDelete: "cascade" }),
  visitorKey: text("visitor_key").notNull(),
  isBot: boolean("is_bot").notNull().default(false),
  botReason: text("bot_reason"),
  ranges: jsonb("ranges").$type<Array<[number, number]>>().notNull().default([]),
  lastPosition: doublePrecision("last_position").notNull().default(0),
  lastHeartbeatAt: timestamp("last_heartbeat_at"),
  startedAt: timestamp("started_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const giftVideoEventsTable = pgTable("gift_video_events", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull(),
  videoId: integer("video_id").notNull().references(() => giftVideosTable.id, { onDelete: "cascade" }),
  prospectId: integer("prospect_id").notNull(),
  campaignId: integer("campaign_id").notNull(),
  emailId: integer("email_id"),
  step: integer("step").notNull().default(3),
  type: text("type").notNull(),
  visitorKey: text("visitor_key").notNull(),
  sessionId: text("session_id"),
  isBot: boolean("is_bot").notNull().default(false),
  botReason: text("bot_reason"),
  isValid: boolean("is_valid").notNull().default(false),
  percentage: integer("percentage"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, t => [index("gift_video_events_video_idx").on(t.videoId, t.createdAt)]);

export type GiftVideo = typeof giftVideosTable.$inferSelect;