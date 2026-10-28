import { Router } from "express";
import { db } from "@workspace/db";
import { appointmentsTable, prospectsTable, activityTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { prospectScope, prospectRecordScope } from "../lib/verticalScope";
import { recruitingPreMeetingBrief } from "../lib/recruitingQualification";
import {
  ListAppointmentsQueryParams,
  CreateAppointmentBody,
  UpdateAppointmentParams,
  UpdateAppointmentBody,
  DeleteAppointmentParams,
} from "@workspace/api-zod";
import { requireAuth, requireEntitlement } from "../lib/requireAuth";
import { recordEngagementEvent, cancelPendingAutomation } from "../lib/engagementScoring";

const router = Router();
router.use(requireAuth, requireEntitlement);

function serializeAppt(a: typeof appointmentsTable.$inferSelect) {
  return { ...a, scheduledAt: a.scheduledAt.toISOString(), createdAt: a.createdAt.toISOString() };
}

router.get("/", async (req, res) => {
  const query = ListAppointmentsQueryParams.parse(req.query);
  const conditions: any[] = [eq(appointmentsTable.clientId, req.clientId)];
  if (query.status) conditions.push(eq(appointmentsTable.status, query.status));
  const appts = await db.select().from(appointmentsTable).where(and(...conditions)).orderBy(sql`${appointmentsTable.scheduledAt} asc`);
  const prospects = appts.length ? await db.select().from(prospectsTable)
    .where(and(prospectScope(req.clientId, req.dbUser.vertical), inArray(prospectsTable.id, appts.map(appt => appt.prospectId)))) : [];
  const byId = new Map(prospects.map(prospect => [prospect.id, prospect]));
  res.json(appts.filter(appt => byId.has(appt.prospectId)).map(appt => {
    const brief = recruitingPreMeetingBrief(byId.get(appt.prospectId)!);
    return { ...serializeAppt(appt), preMeetingBrief: brief || null };
  }));
});

router.post("/", async (req, res) => {
  const body = CreateAppointmentBody.parse(req.body);
  const [owned] = await db.select({ id: prospectsTable.id }).from(prospectsTable)
    .where(and(eq(prospectsTable.id, body.prospectId), prospectScope(req.clientId, req.dbUser.vertical)));
  if (!owned) return res.status(404).json({ error: "Prospect not found in the selected selling industry." });
  const [appt] = await db.insert(appointmentsTable).values({
    ...body,
    clientId: req.clientId,
    scheduledAt: new Date(body.scheduledAt),
    status: "scheduled",
  }).returning();
  const [prospect] = await db.select().from(prospectsTable).where(and(eq(prospectsTable.id, body.prospectId), eq(prospectsTable.clientId, req.clientId)));
  await db.insert(activityTable).values({
    clientId: req.clientId,
    type: "appointment_set",
    description: `${body.type.replace("_", " ")} scheduled with ${prospect?.companyName ?? "prospect"}`,
    prospectId: body.prospectId,
    prospectName: prospect?.contactName ?? null,
  });
  await db.update(prospectsTable).set({ status: "appointment_set" }).where(and(eq(prospectsTable.id, body.prospectId), eq(prospectsTable.clientId, req.clientId)));
  // Interest scoring: meeting scheduled (+points, once), and any pending
  // repeated-open follow-up is now moot.
  await recordEngagementEvent(body.prospectId, "meeting_scheduled");
  await cancelPendingAutomation(body.prospectId, "Meeting already scheduled");
  return res.status(201).json(serializeAppt(appt));
});

router.patch("/:id", async (req, res) => {
  const { id } = UpdateAppointmentParams.parse({ id: parseInt(req.params.id) });
  const body = UpdateAppointmentBody.parse(req.body);
  const updateData: Record<string, unknown> = { ...body };
  if (body.scheduledAt) updateData.scheduledAt = new Date(body.scheduledAt);
  const [appt] = await db.update(appointmentsTable).set(updateData).where(and(eq(appointmentsTable.id, id), prospectRecordScope(appointmentsTable, req.clientId, req.dbUser?.vertical))).returning();
  if (!appt) return res.status(404).json({ error: "Appointment not found" });
  return res.json(serializeAppt(appt));
});

router.delete("/:id", async (req, res) => {
  const { id } = DeleteAppointmentParams.parse({ id: parseInt(req.params.id) });
  await db.delete(appointmentsTable).where(and(eq(appointmentsTable.id, id), prospectRecordScope(appointmentsTable, req.clientId, req.dbUser?.vertical)));
  res.status(204).send();
});

export default router;
