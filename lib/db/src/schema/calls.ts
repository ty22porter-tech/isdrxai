import { pgTable, text, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { prospectsTable } from "./prospects";
import { callTasksTable } from "./call-tasks";

export const callsTable = pgTable("calls", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull().default(""),
  prospectId: integer("prospect_id").notNull().references(() => prospectsTable.id, { onDelete: "cascade" }),
  taskId: integer("task_id").references(() => callTasksTable.id, { onDelete: "set null" }),
  callerId: text("caller_id"),
  callbackAt: timestamp("callback_at", { withTimezone: true }),
  provider: text("provider"),
  externalId: text("external_id"),
  status: text("status").notNull().default("completed"),
  duration: integer("duration"),
  notes: text("notes"),
  outcome: text("outcome"),
  callScript: text("call_script"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("calls_task_id_idx").on(t.taskId),
]);

export const insertCallSchema = createInsertSchema(callsTable).omit({ id: true, createdAt: true, clientId: true });
export type InsertCall = z.infer<typeof insertCallSchema>;
export type Call = typeof callsTable.$inferSelect;
