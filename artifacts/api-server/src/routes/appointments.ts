import { Router } from "express";
import { db } from "@workspace/db";
import { appointmentsTable, prospectsTable, activityTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  ListAppointmentsQueryParams,
  CreateAppointmentBody,
  UpdateAppointmentParams,
  UpdateAppointmentBody,
  DeleteAppointmentParams,
} from "@workspace/api-zod";

const router = Router();

function serializeAppt(a: typeof appointmentsTable.$inferSelect) {
  return { ...a, scheduledAt: a.scheduledAt.toISOString(), createdAt: a.createdAt.toISOString() };
}

router.get("/", async (req, res) => {
  const query = ListAppointmentsQueryParams.parse(req.query);
  const where = query.status ? eq(appointmentsTable.status, query.status) : undefined;
  const appts = await db.select().from(appointmentsTable).where(where).orderBy(sql`${appointmentsTable.scheduledAt} asc`);
  res.json(appts.map(serializeAppt));
});

router.post("/", async (req, res) => {
  const body = CreateAppointmentBody.parse(req.body);
  const [appt] = await db.insert(appointmentsTable).values({
    ...body,
    scheduledAt: new Date(body.scheduledAt),
    status: "scheduled",
  }).returning();
  const [prospect] = await db.select().from(prospectsTable).where(eq(prospectsTable.id, body.prospectId));
  await db.insert(activityTable).values({
    type: "appointment_set",
    description: `${body.type.replace("_", " ")} scheduled with ${prospect?.companyName ?? "prospect"}`,
    prospectId: body.prospectId,
    prospectName: prospect?.contactName ?? null,
  });
  await db.update(prospectsTable).set({ status: "appointment_set" }).where(eq(prospectsTable.id, body.prospectId));
  res.status(201).json(serializeAppt(appt));
});

router.patch("/:id", async (req, res) => {
  const { id } = UpdateAppointmentParams.parse({ id: parseInt(req.params.id) });
  const body = UpdateAppointmentBody.parse(req.body);
  const updateData: Record<string, unknown> = { ...body };
  if (body.scheduledAt) updateData.scheduledAt = new Date(body.scheduledAt);
  const [appt] = await db.update(appointmentsTable).set(updateData).where(eq(appointmentsTable.id, id)).returning();
  if (!appt) return res.status(404).json({ error: "Appointment not found" });
  res.json(serializeAppt(appt));
});

router.delete("/:id", async (req, res) => {
  const { id } = DeleteAppointmentParams.parse({ id: parseInt(req.params.id) });
  await db.delete(appointmentsTable).where(eq(appointmentsTable.id, id));
  res.status(204).send();
});

export default router;
