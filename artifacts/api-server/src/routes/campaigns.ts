import { Router } from "express";
import { db } from "@workspace/db";
import { campaignsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  CreateCampaignBody,
  UpdateCampaignParams,
  UpdateCampaignBody,
  DeleteCampaignParams,
  GetCampaignParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res) => {
  const campaigns = await db.select().from(campaignsTable).orderBy(sql`${campaignsTable.createdAt} desc`);
  res.json(campaigns.map(c => ({ ...c, createdAt: c.createdAt.toISOString() })));
});

router.post("/", async (req, res) => {
  const body = CreateCampaignBody.parse(req.body);
  const [campaign] = await db.insert(campaignsTable).values(body).returning();
  res.status(201).json({ ...campaign, createdAt: campaign.createdAt.toISOString() });
});

router.get("/:id", async (req, res) => {
  const { id } = GetCampaignParams.parse({ id: parseInt(req.params.id) });
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  res.json({ ...campaign, createdAt: campaign.createdAt.toISOString() });
});

router.patch("/:id", async (req, res) => {
  const { id } = UpdateCampaignParams.parse({ id: parseInt(req.params.id) });
  const body = UpdateCampaignBody.parse(req.body);
  const [campaign] = await db.update(campaignsTable).set(body).where(eq(campaignsTable.id, id)).returning();
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  res.json({ ...campaign, createdAt: campaign.createdAt.toISOString() });
});

router.delete("/:id", async (req, res) => {
  const { id } = DeleteCampaignParams.parse({ id: parseInt(req.params.id) });
  await db.delete(campaignsTable).where(eq(campaignsTable.id, id));
  res.status(204).send();
});

export default router;
