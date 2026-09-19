import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z, ZodError } from "zod";
import { db, giftOutreachRecordsTable } from "@workspace/db";
import {
  GenerateProspectGiftSuggestionsBody,
  GenerateProspectGiftSuggestionsResponse,
  GetProspectGiftSuggestionsResponse,
} from "@workspace/api-zod";
import { requireAuth, requireEntitlement } from "../lib/requireAuth";
import { GiftOutreachError, publicGiftRecord, getGiftSettings, updateGiftSettings, getGiftRecord, createGiftRecord, updateGiftRecord, prepareGiftRecord, approveGiftRecord, sendGiftRecord, skipGiftRecord } from "../lib/giftOutreach";
import { giftRecordEditSchema, giftSettingsSchema } from "../lib/giftOutreachPolicy";
import { generateGiftSuggestions, getProspectGiftSuggestions } from "../lib/giftSuggestions";

const router = Router();
router.use(requireAuth);
router.use((req, res, next) => req.method === "GET" ? next() : requireEntitlement(req, res, next));
const id = z.coerce.number().int().positive();

router.get("/settings", async (req, res) => { res.json(await getGiftSettings(req.clientId)); });
router.patch("/settings", async (req, res) => { res.json(await updateGiftSettings(req.clientId, giftSettingsSchema.partial().parse(req.body))); });
router.get("/records", async (req, res) => {
  const filters = [eq(giftOutreachRecordsTable.clientId, req.clientId)];
  if (req.query.prospectId) filters.push(eq(giftOutreachRecordsTable.prospectId, id.parse(req.query.prospectId)));
  if (req.query.campaignId) filters.push(eq(giftOutreachRecordsTable.campaignId, id.parse(req.query.campaignId)));
  const rows = await db.select().from(giftOutreachRecordsTable).where(and(...filters)).orderBy(desc(giftOutreachRecordsTable.createdAt)).limit(500);
  res.json(rows.map(publicGiftRecord));
});
router.get("/prospects/:prospectId", async (req, res) => {
  const filters = [eq(giftOutreachRecordsTable.clientId, req.clientId), eq(giftOutreachRecordsTable.prospectId, id.parse(req.params.prospectId))];
  if (req.query.campaignId) filters.push(eq(giftOutreachRecordsTable.campaignId, id.parse(req.query.campaignId)));
  res.json((await db.select().from(giftOutreachRecordsTable).where(and(...filters)).orderBy(desc(giftOutreachRecordsTable.createdAt))).map(publicGiftRecord));
});
router.get("/prospects/:prospectId/suggestions", async (req, res) => {
  res.json(GetProspectGiftSuggestionsResponse.parse(
    await getProspectGiftSuggestions(req.clientId, id.parse(req.params.prospectId)),
  ));
});
router.post("/prospects/:prospectId/suggestions", async (req, res) => {
  const input = GenerateProspectGiftSuggestionsBody.parse(req.body);
  res.json(GenerateProspectGiftSuggestionsResponse.parse(
    await generateGiftSuggestions(req.clientId, id.parse(req.params.prospectId), input.budgetUsd),
  ));
});
router.post("/records", async (req, res) => {
  const input = giftRecordEditSchema.extend({ prospectId: id, campaignId: id, optInEnrollment: z.boolean().optional() }).parse(req.body);
  const { prospectId, campaignId, optInEnrollment, ...fields } = input;
  res.status(201).json(publicGiftRecord(await createGiftRecord(req.clientId, prospectId, campaignId, fields, optInEnrollment)));
});
router.get("/records/:id", async (req, res) => { res.json(publicGiftRecord(await getGiftRecord(req.clientId, id.parse(req.params.id)))); });
router.patch("/records/:id", async (req, res) => { res.json(publicGiftRecord(await updateGiftRecord(req.clientId, id.parse(req.params.id), req.body))); });
for (const [action, handler] of Object.entries({ prepare: prepareGiftRecord, approve: approveGiftRecord, send: sendGiftRecord, skip: skipGiftRecord })) {
  router.post(`/records/:id/${action}`, async (req, res) => { res.json(publicGiftRecord(await handler(req.clientId, id.parse(req.params.id)))); });
}
router.use((err: unknown, req: import("express").Request, res: import("express").Response, _next: import("express").NextFunction) => {
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") });
  if (err instanceof GiftOutreachError) return res.status(err.status).json({ error: err.message });
  req.log.error({ err }, "Gift outreach request failed");
  return res.status(500).json({ error: "Gift outreach request failed. Please try again." });
});
export default router;