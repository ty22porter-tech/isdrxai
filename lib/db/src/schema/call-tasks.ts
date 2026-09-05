import { pgTable, text, serial, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { prospectsTable } from "./prospects";
import { campaignsTable } from "./campaigns";

export const callTasksTable = pgTable("call_tasks", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull(),
  prospectId: integer("prospect_id").notNull().references(() => prospectsTable.id, { onDelete: "cascade" }),
  campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id, { onDelete: "cascade" }),
  sourceTrigger: text("source_trigger").notNull(),
  priority: integer("priority").notNull().default(0),
  status: text("status").notNull().default("queued"),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
  claimedBy: text("claimed_by"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  outcome: text("outcome"),
  completionNotes: text("completion_notes"),
  suppressedAt: timestamp("suppressed_at", { withTimezone: true }),
  suppressionReason: text("suppression_reason"),
  idempotencyKey: text("idempotency_key").notNull(),
  approvedScriptSnapshot: text("approved_script_snapshot").notNull(),
  approvedScriptVersion: integer("approved_script_version").notNull(),
  provider: text("provider"),
  externalId: text("external_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("call_tasks_client_idempotency_idx").on(t.clientId, t.idempotencyKey),
  index("call_tasks_queue_idx").on(t.clientId, t.status, t.dueAt, t.priority),
  index("call_tasks_prospect_idx").on(t.clientId, t.prospectId),
]);

export const insertCallTaskSchema = createInsertSchema(callTasksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCallTask = z.infer<typeof insertCallTaskSchema>;
export type CallTask = typeof callTasksTable.$inferSelect;