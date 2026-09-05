import { Router } from "express";
import { db } from "@workspace/db";
import { callsTable, prospectsTable, activityTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import {
  ListCallsQueryParams,
  CreateCallBody,
  UpdateCallParams,
  UpdateCallBody,
} from "@workspace/api-zod";
import { requireAuth, requireEntitlement } from "../lib/requireAuth";

const router = Router();
router.use(requireAuth, requireEntitlement);

function serializeCall(c: typeof callsTable.$inferSelect) {
  return { ...c, createdAt: c.createdAt.toISOString() };
}

router.get("/", async (req, res) => {
  const query = ListCallsQueryParams.parse(req.query);
  const conditions: any[] = [eq(callsTable.clientId, req.clientId)];
  if (query.prospectId) conditions.push(eq(callsTable.prospectId, query.prospectId));
  const calls = await db.select().from(callsTable).where(and(...conditions)).orderBy(sql`${callsTable.createdAt} desc`);
  res.json(calls.map(serializeCall));
});

router.post("/", async (req, res) => {
  const body = CreateCallBody.parse(req.body);
  const [call] = await db.insert(callsTable).values({ ...body, clientId: req.clientId }).returning();
  const [prospect] = await db.select().from(prospectsTable).where(and(eq(prospectsTable.id, body.prospectId), eq(prospectsTable.clientId, req.clientId)));
  await db.insert(activityTable).values({
    clientId: req.clientId,
    type: "call_made",
    description: `Call logged for ${prospect?.companyName ?? "prospect"} — ${body.outcome ?? body.status}`,
    prospectId: body.prospectId,
    prospectName: prospect?.contactName ?? null,
  });
  await db.update(prospectsTable).set({ lastContactedAt: new Date() }).where(and(eq(prospectsTable.id, body.prospectId), eq(prospectsTable.clientId, req.clientId)));
  res.status(201).json(serializeCall(call));
});

router.patch("/:id", async (req, res) => {
  const { id } = UpdateCallParams.parse({ id: parseInt(req.params.id) });
  const body = UpdateCallBody.parse(req.body);
  const [call] = await db.update(callsTable).set(body).where(and(eq(callsTable.id, id), eq(callsTable.clientId, req.clientId))).returning();
  if (!call) return res.status(404).json({ error: "Call not found" });
  return res.json(serializeCall(call));
});

export default router;
