import { Router } from "express";
import { db } from "@workspace/db";
import { campaignsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import {
  CreateCampaignBody,
  UpdateCampaignParams,
  UpdateCampaignBody,
  DeleteCampaignParams,
  GetCampaignParams,
} from "@workspace/api-zod";
import { requireAuth, requireEntitlement } from "../lib/requireAuth";
import { requireAdmin } from "../lib/requireAuth";
import { z } from "zod/v4";
import { campaignScope } from "../lib/verticalScope";
import { normalizeVertical } from "../lib/verticals";

const router = Router();
router.use(requireAuth, requireEntitlement);
router.use(async (req, res, next) => {
  const id = /^\/(\d+)(?:\/|$)/.exec(req.path)?.[1];
  if (id) {
    const [owned] = await db.select({ id: campaignsTable.id }).from(campaignsTable)
      .where(and(eq(campaignsTable.id, Number(id)), campaignScope(req.clientId, req.dbUser.vertical)));
    if (!owned) return res.status(404).json({ error: "Campaign not found in the selected selling industry." });
  }
  return next();
});

router.get("/", async (req, res) => {
  const campaigns = await db.select().from(campaignsTable).where(campaignScope(req.clientId, req.dbUser.vertical)).orderBy(sql`${campaignsTable.createdAt} desc`);
  res.json(campaigns.map(c => ({ ...c, createdAt: c.createdAt.toISOString() })));
});

router.post("/", async (req, res) => {
  const body = CreateCampaignBody.parse(req.body);
  const [campaign] = await db.insert(campaignsTable).values({ ...body, clientId: req.clientId, vertical: normalizeVertical(req.dbUser.vertical) }).returning();
  res.status(201).json({ ...campaign, createdAt: campaign.createdAt.toISOString() });
});

router.get("/:id", async (req, res) => {
  const { id } = GetCampaignParams.parse({ id: parseInt(req.params.id) });
  const [campaign] = await db.select().from(campaignsTable).where(and(eq(campaignsTable.id, id), eq(campaignsTable.clientId, req.clientId)));
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  return res.json({ ...campaign, createdAt: campaign.createdAt.toISOString() });
});

router.patch("/:id", async (req, res) => {
  const { id } = UpdateCampaignParams.parse({ id: parseInt(req.params.id) });
  const body: Record<string, any> = UpdateCampaignBody.parse(req.body);
  // followUpMode is not in the generated zod schema (Option A/B for the
  // repeated-open follow-up) — validate and pass it through manually.
  const fm = (req.body ?? {}).followUpMode;
  if (fm !== undefined) {
    if (fm !== "meeting_request" && fm !== "questionnaire_first") {
      return res.status(400).json({ error: "followUpMode must be 'meeting_request' or 'questionnaire_first'" });
    }
    body.followUpMode = fm;
  }
  if (Object.prototype.hasOwnProperty.call(body, "callScript")) {
    body.callScriptApprovedAt = null;
    body.callScriptApprovedBy = null;
  }
  const [campaign] = await db.update(campaignsTable).set(body).where(and(eq(campaignsTable.id, id), eq(campaignsTable.clientId, req.clientId))).returning();
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  return res.json({ ...campaign, createdAt: campaign.createdAt.toISOString() });
});

router.post("/:id/approve-script", requireAdmin, async (req, res): Promise<void> => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const body = z.object({ expectedScript: z.string().optional() }).strict().safeParse(req.body ?? {});
  if (!id.success || !body.success) {
    res.status(400).json({ error: (!id.success ? id.error : body.error)!.message });
    return;
  }
  const [existing] = await db.select().from(campaignsTable).where(and(
    eq(campaignsTable.id, id.data),
    eq(campaignsTable.clientId, req.clientId),
  ));
  if (!existing) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  if (existing.type !== "call") {
    res.status(400).json({ error: "Only call campaign scripts can be approved for the caller pilot" });
    return;
  }
  const script = existing.callScript?.trim();
  if (!script) {
    res.status(400).json({ error: "A non-empty call script is required before approval" });
    return;
  }
  if (body.data.expectedScript !== undefined && body.data.expectedScript.trim() !== script) {
    res.status(409).json({ error: "Call script changed before it could be approved" });
    return;
  }
  const [campaign] = await db.update(campaignsTable).set({
    callScript: script,
    callScriptApprovedAt: new Date(),
    callScriptApprovedBy: req.clientId,
    callScriptVersion: sql`${campaignsTable.callScriptVersion} + 1`,
  }).where(and(
    eq(campaignsTable.id, id.data),
    eq(campaignsTable.clientId, req.clientId),
  )).returning();
  res.json({ ...campaign, createdAt: campaign.createdAt.toISOString() });
});

router.delete("/:id", async (req, res) => {
  const { id } = DeleteCampaignParams.parse({ id: parseInt(req.params.id) });
  await db.delete(campaignsTable).where(and(eq(campaignsTable.id, id), eq(campaignsTable.clientId, req.clientId)));
  res.status(204).send();
});

export default router;
