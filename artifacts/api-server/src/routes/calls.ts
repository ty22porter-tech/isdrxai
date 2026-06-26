import { Router } from "express";
import { db } from "@workspace/db";
import { callsTable, prospectsTable, activityTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  ListCallsQueryParams,
  CreateCallBody,
  UpdateCallParams,
  UpdateCallBody,
} from "@workspace/api-zod";

const router = Router();

function serializeCall(c: typeof callsTable.$inferSelect) {
  return { ...c, createdAt: c.createdAt.toISOString() };
}

router.get("/", async (req, res) => {
  const query = ListCallsQueryParams.parse(req.query);
  const where = query.prospectId ? eq(callsTable.prospectId, query.prospectId) : undefined;
  const calls = await db.select().from(callsTable).where(where).orderBy(sql`${callsTable.createdAt} desc`);
  res.json(calls.map(serializeCall));
});

router.post("/", async (req, res) => {
  const body = CreateCallBody.parse(req.body);
  const [call] = await db.insert(callsTable).values(body).returning();
  const [prospect] = await db.select().from(prospectsTable).where(eq(prospectsTable.id, body.prospectId));
  await db.insert(activityTable).values({
    type: "call_made",
    description: `Call logged for ${prospect?.companyName ?? "prospect"} — ${body.outcome ?? body.status}`,
    prospectId: body.prospectId,
    prospectName: prospect?.contactName ?? null,
  });
  await db.update(prospectsTable).set({ lastContactedAt: new Date() }).where(eq(prospectsTable.id, body.prospectId));
  res.status(201).json(serializeCall(call));
});

router.patch("/:id", async (req, res) => {
  const { id } = UpdateCallParams.parse({ id: parseInt(req.params.id) });
  const body = UpdateCallBody.parse(req.body);
  const [call] = await db.update(callsTable).set(body).where(eq(callsTable.id, id)).returning();
  if (!call) return res.status(404).json({ error: "Call not found" });
  res.json(serializeCall(call));
});

export default router;
