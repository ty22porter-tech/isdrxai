import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { prospectsTable, activityTable } from "@workspace/db";
import { eq, ilike, and, sql } from "drizzle-orm";
import {
  ListProspectsQueryParams,
  CreateProspectBody,
  BulkCreateProspectsBody,
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
  const scheduleToken = randomUUID();
  const [prospect] = await db.insert(prospectsTable).values({ ...body, clientId: req.clientId, status: "new", scheduleToken }).returning();
  await db.insert(activityTable).values({
    clientId: req.clientId,
    type: "prospect_added",
    description: `New prospect added: ${prospect.companyName}`,
    prospectId: prospect.id,
    prospectName: prospect.contactName,
  });
  res.status(201).json({ ...prospect, lastContactedAt: prospect.lastContactedAt?.toISOString() ?? null, createdAt: prospect.createdAt.toISOString() });
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/bulk", async (req, res) => {
  const { prospects } = BulkCreateProspectsBody.parse(req.body);
  const results: { index: number; success: boolean; error?: string; prospect?: any }[] = [];
  let added = 0;
  let failed = 0;
  const existing = await db
    .select({ email: prospectsTable.email })
    .from(prospectsTable)
    .where(eq(prospectsTable.clientId, req.clientId));
  const seenEmails = new Set(existing.map((p) => p.email.trim().toLowerCase()));
  const validRows: { index: number; values: any }[] = [];
  for (let i = 0; i < prospects.length; i++) {
    const input = prospects[i];
    const email = (input.email ?? "").trim().toLowerCase();
    if (!input.companyName?.trim()) {
      failed++;
      results.push({ index: i, success: false, error: "Missing company name" });
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      failed++;
      results.push({ index: i, success: false, error: `Invalid email address: "${input.email || "(empty)"}"` });
      continue;
    }
    if (seenEmails.has(email)) {
      failed++;
      results.push({ index: i, success: false, error: `Duplicate: a prospect with email ${input.email} already exists` });
      continue;
    }
    seenEmails.add(email);
    validRows.push({ index: i, values: { ...input, clientId: req.clientId, status: "new", scheduleToken: randomUUID() } });
  }

  const BATCH_SIZE = 500;
  for (let start = 0; start < validRows.length; start += BATCH_SIZE) {
    const batch = validRows.slice(start, start + BATCH_SIZE);
    try {
      const inserted = await db.transaction(async (tx) => {
        const rows = await tx.insert(prospectsTable).values(batch.map((r) => r.values)).returning();
        if (rows.length > 0) {
          await tx.insert(activityTable).values(rows.map((p) => ({
            clientId: req.clientId,
            type: "prospect_added",
            description: `New prospect added: ${p.companyName}`,
            prospectId: p.id,
            prospectName: p.contactName,
          })));
        }
        return rows;
      });
      const byToken = new Map(inserted.map((p) => [p.scheduleToken, p]));
      for (const row of batch) {
        const prospect = byToken.get(row.values.scheduleToken);
        if (!prospect) {
          failed++;
          results.push({ index: row.index, success: false, error: "Failed to create prospect" });
          continue;
        }
        added++;
        results.push({
          index: row.index,
          success: true,
          prospect: { ...prospect, lastContactedAt: prospect.lastContactedAt?.toISOString() ?? null, createdAt: prospect.createdAt.toISOString() },
        });
      }
    } catch (err: any) {
      for (const row of batch) {
        failed++;
        results.push({ index: row.index, success: false, error: err?.message ?? "Failed to create prospect" });
      }
    }
  }

  results.sort((a, b) => a.index - b.index);
  res.json({ added, failed, results });
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
