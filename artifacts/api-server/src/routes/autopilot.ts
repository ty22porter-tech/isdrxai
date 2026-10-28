import { Router } from "express";
import { db, autopilotEnrollmentsTable, prospectsTable, campaignsTable, usersTable } from "@workspace/db";
import { eq, and, desc, isNull } from "drizzle-orm";
import { requireAuth, requireEntitlement } from "../lib/requireAuth";
import { processAutopilotQueue } from "../lib/autopilotEngine";
import { getGiftSettings } from "../lib/giftOutreach";
import { prospectScope, prospectRecordScope, campaignScope } from "../lib/verticalScope";
import { recruitingAutomationBlocked } from "../lib/recruitingResearch";

const router = Router();
router.use(requireAuth, requireEntitlement);

function serializeEnrollment(e: typeof autopilotEnrollmentsTable.$inferSelect) {
  return {
    ...e,
    nextSendAt: e.nextSendAt?.toISOString() ?? null,
    lastEmailSentAt: e.lastEmailSentAt?.toISOString() ?? null,
    repliedAt: e.repliedAt?.toISOString() ?? null,
    calendlyLinkSentAt: e.calendlyLinkSentAt?.toISOString() ?? null,
    bookedAt: e.bookedAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}

router.get("/enrollments", async (req, res) => {
  const enrollments = await db
    .select({
      enrollment: autopilotEnrollmentsTable,
      prospect: prospectsTable,
      campaign: campaignsTable,
    })
    .from(autopilotEnrollmentsTable)
    .leftJoin(prospectsTable, eq(autopilotEnrollmentsTable.prospectId, prospectsTable.id))
    .leftJoin(campaignsTable, eq(autopilotEnrollmentsTable.campaignId, campaignsTable.id))
    .where(prospectRecordScope(autopilotEnrollmentsTable, req.clientId, req.dbUser?.vertical))
    .orderBy(desc(autopilotEnrollmentsTable.createdAt));

  res.json(enrollments.map(row => ({
    ...serializeEnrollment(row.enrollment),
    prospect: row.prospect ? {
      id: row.prospect.id,
      companyName: row.prospect.companyName,
      contactName: row.prospect.contactName,
      email: row.prospect.email,
      industry: row.prospect.industry,
      city: row.prospect.city,
      state: row.prospect.state,
      status: row.prospect.status,
    } : null,
    campaign: row.campaign ? {
      id: row.campaign.id,
      name: row.campaign.name,
      targetIndustry: row.campaign.targetIndustry,
    } : null,
  })));
});

router.post("/enroll", requireEntitlement, async (req, res) => {
  const { campaignId, prospectIds, startNow } = req.body;
  if (!Array.isArray(prospectIds) || prospectIds.length === 0) {
    return res.status(400).json({ error: "prospectIds required" });
  }

  // Campaign is optional. Without one, autopilot uses the standard 3-step AI sequence.
  if (campaignId) {
    const [campaign] = await db.select().from(campaignsTable)
      .where(and(eq(campaignsTable.id, campaignId), campaignScope(req.clientId, req.dbUser?.vertical)));
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  }

  const client = req.dbUser;
  if (!client.outreachEmail) {
    return res.status(400).json({ error: "Reply-to email not set. Go to Settings to add your email address." });
  }

  const nextSendAt = startNow ? new Date() : new Date(Date.now() + 10 * 60 * 1000);
  const results = [];

  for (const prospectId of prospectIds) {
    const [prospect] = await db.select().from(prospectsTable)
      .where(and(eq(prospectsTable.id, prospectId), prospectScope(req.clientId, req.dbUser?.vertical)));
    if (!prospect) continue;
    if (recruitingAutomationBlocked(prospect)) continue;

    const existing = await db.select().from(autopilotEnrollmentsTable)
      .where(and(
        eq(autopilotEnrollmentsTable.clientId, req.clientId),
        eq(autopilotEnrollmentsTable.prospectId, prospectId),
        campaignId
          ? eq(autopilotEnrollmentsTable.campaignId, campaignId)
          : isNull(autopilotEnrollmentsTable.campaignId),
      ));
    if (existing.length > 0) continue;

    const giftMode = !!campaignId && (await getGiftSettings(req.clientId)).enabled;
    const [enrollment] = await db.insert(autopilotEnrollmentsTable)
      .values({ clientId: req.clientId, campaignId: campaignId ?? null, prospectId, status: "active", nextSendAt, giftMode })
      .returning();
    results.push(serializeEnrollment(enrollment));
  }

  if (startNow) {
    processAutopilotQueue().catch(() => {});
  }

  return res.status(201).json({ enrolled: results.length, enrollments: results });
});

router.post("/enrollments/:id/reply", requireEntitlement, async (req, res) => {
  const id = parseInt(String(req.params.id));
  const { replyContent } = req.body;
  if (!replyContent) return res.status(400).json({ error: "replyContent required" });

  const [enrollment] = await db.select().from(autopilotEnrollmentsTable)
    .where(and(eq(autopilotEnrollmentsTable.id, id), prospectRecordScope(autopilotEnrollmentsTable, req.clientId, req.dbUser?.vertical)));
  if (!enrollment) return res.status(404).json({ error: "Enrollment not found" });

  const replyTone = await (async () => {
    try {
      const { analyzeReplyTone } = await import("../lib/autopilotEngine") as any;
      return typeof analyzeReplyTone === "function"
        ? await analyzeReplyTone(replyContent)
        : "neutral";
    } catch { return "neutral"; }
  })();

  const [updated] = await db.update(autopilotEnrollmentsTable)
    .set({
      status: "replied",
      repliedAt: new Date(),
      replyContent,
      replyTone,
    })
    .where(eq(autopilotEnrollmentsTable.id, id))
    .returning();

  processAutopilotQueue().catch(() => {});
  return res.json(serializeEnrollment(updated));
});

router.post("/enrollments/:id/book", async (req, res) => {
  const id = parseInt(req.params.id);
  const [updated] = await db.update(autopilotEnrollmentsTable)
    .set({ status: "booked", bookedAt: new Date() })
    .where(and(eq(autopilotEnrollmentsTable.id, id), prospectRecordScope(autopilotEnrollmentsTable, req.clientId, req.dbUser?.vertical)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(serializeEnrollment(updated));
});

router.patch("/enrollments/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  const [updated] = await db.update(autopilotEnrollmentsTable)
    .set({ status })
    .where(and(eq(autopilotEnrollmentsTable.id, id), prospectRecordScope(autopilotEnrollmentsTable, req.clientId, req.dbUser?.vertical)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(serializeEnrollment(updated));
});

router.delete("/enrollments/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(autopilotEnrollmentsTable)
    .where(and(eq(autopilotEnrollmentsTable.id, id), prospectRecordScope(autopilotEnrollmentsTable, req.clientId, req.dbUser?.vertical)));
  res.status(204).send();
});

export default router;
