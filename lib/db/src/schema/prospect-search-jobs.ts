import { pgTable, text, integer, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const prospectSearchJobsTable = pgTable("prospect_search_jobs", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  requestKey: text("request_key").notNull(),
  request: jsonb("request").notNull(),
  discovery: jsonb("discovery"),
  checkpoints: jsonb("checkpoints").notNull().default({}),
  attempts: jsonb("attempts").notNull().default({}),
  status: text("status").notNull().default("queued"),
  response: jsonb("response"),
  responseStatus: integer("response_status"),
  retryAt: timestamp("retry_at", { withTimezone: true }),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  leaseOwner: text("lease_owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("prospect_search_jobs_client_request_key").on(table.clientId, table.requestKey)]);
