import { Router } from "express";
import { db } from "@workspace/db";
import { prospectsTable, activityTable } from "@workspace/db";
import { eq, ilike, and, sql } from "drizzle-orm";
import {
  ListProspectsQueryParams,
  CreateProspectBody,
  UpdateProspectParams,
  UpdateProspectBody,
  DeleteProspectParams,
  GetProspectParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/requireAuth";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const query = ListProspectsQueryParams.parse(req.query);
  const conditions: any[] = [eq(prospectsTable.clientId, req.clientId)];
  if (query.status) conditions.push(eq(prospectsTable.status, query.status));
  if (query.search) conditions.push(ilike(prospectsTable.companyName, `%${query.search}%`));
  const prospects = await db.select().from(prospectsTable).where(and(...conditions)).orderBy(sql`${prospectsTable.createdAt} desc`);
  res.json(prospects.map(p => ({
    ...p,
    lastContactedAt: p.lastContactedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  })));
});

router.post("/", async (req, res) => {
  const body = CreateProspectBody.parse(req.body);
  const [prospect] = await db.insert(prospectsTable).values({ ...body, clientId: req.clientId, status: "new" }).returning();
  await db.insert(activityTable).values({
    clientId: req.clientId,
    type: "prospect_added",
    description: `New prospect added: ${prospect.companyName}`,
    prospectId: prospect.id,
    prospectName: prospect.contactName,
  });
  res.status(201).json({ ...prospect, lastContactedAt: prospect.lastContactedAt?.toISOString() ?? null, createdAt: prospect.createdAt.toISOString() });
});

router.get("/:id", async (req, res) => {
  const { id } = GetProspectParams.parse({ id: parseInt(req.params.id) });
  const [prospect] = await db.select().from(prospectsTable).where(and(eq(prospectsTable.id, id), eq(prospectsTable.clientId, req.clientId)));
  if (!prospect) return res.status(404).json({ error: "Prospect not found" });
  res.json({ ...prospect, lastContactedAt: prospect.lastContactedAt?.toISOString() ?? null, createdAt: prospect.createdAt.toISOString() });
});

router.patch("/:id", async (req, res) => {
  const { id } = UpdateProspectParams.parse({ id: parseInt(req.params.id) });
  const body = UpdateProspectBody.parse(req.body);
  const [prospect] = await db.update(prospectsTable).set(body).where(and(eq(prospectsTable.id, id), eq(prospectsTable.clientId, req.clientId))).returning();
  if (!prospect) return res.status(404).json({ error: "Prospect not found" });
  if (body.status) {
    await db.insert(activityTable).values({
      clientId: req.clientId,
      type: "status_changed",
      description: `${prospect.companyName} status updated to ${body.status}`,
      prospectId: prospect.id,
      prospectName: prospect.contactName,
    });
  }
  res.json({ ...prospect, lastContactedAt: prospect.lastContactedAt?.toISOString() ?? null, createdAt: prospect.createdAt.toISOString() });
});

router.delete("/:id", async (req, res) => {
  const { id } = DeleteProspectParams.parse({ id: parseInt(req.params.id) });
  await db.delete(prospectsTable).where(and(eq(prospectsTable.id, id), eq(prospectsTable.clientId, req.clientId)));
  res.status(204).send();
});

export default router;
