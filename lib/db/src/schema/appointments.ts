import { pgTable, text, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { prospectsTable } from "./prospects";

export const appointmentsTable = pgTable("appointments", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull().default(""),
  prospectId: integer("prospect_id").notNull().references(() => prospectsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("walkthrough"),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: text("status").notNull().default("scheduled"),
  location: text("location"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Calendly invitee URI for bookings created by the Calendly webhook.
  // Unique (where present) = idempotency key for webhook retries.
  calendlyInviteeUri: text("calendly_invitee_uri"),
}, (t) => [
  // Plain unique index (NULLs never conflict in Postgres) so drizzle's
  // onConflictDoNothing({ target }) can match it for idempotent inserts.
  uniqueIndex("appointments_calendly_invitee_uri_uq").on(t.calendlyInviteeUri),
]);

export const insertAppointmentSchema = createInsertSchema(appointmentsTable).omit({ id: true, createdAt: true, clientId: true, calendlyInviteeUri: true });
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointmentsTable.$inferSelect;
