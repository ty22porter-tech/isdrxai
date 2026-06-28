import { Router } from "express";
import { db } from "@workspace/db";
import { emailsTable, campaignsTable, prospectsTable, activityTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import {
  ListEmailsQueryParams,
  CreateEmailBody,
  UpdateEmailParams,
  UpdateEmailBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/requireAuth";

const router = Router();
router.use(requireAuth);

function serializeEmail(e: typeof emailsTable.$inferSelect) {
  return {
    ...e,
    sentAt: e.sentAt.toISOString(),
    openedAt: e.openedAt?.toISOString() ?? null,
    repliedAt: e.repliedAt?.toISOString() ?? null,
  };
}

router.get("/", async (req, res) => {
  const query = ListEmailsQueryParams.parse(req.query);
  const conditions: any[] = [eq(emailsTable.clientId, req.clientId)];
  if (query.prospectId) conditions.push(eq(emailsTable.prospectId, query.prospectId));
  if (query.campaignId) conditions.push(eq(emailsTable.campaignId, query.campaignId));
  const emails = await db.select().from(emailsTable).where(and(...conditions)).orderBy(sql`${emailsTable.sentAt} desc`);
  res.json(emails.map(serializeEmail));
});

router.post("/", async (req, res) => {
  const body = CreateEmailBody.parse(req.body);
  const [email] = await db.insert(emailsTable).values({ ...body, clientId: req.clientId, status: body.status ?? "sent" }).returning();
  const [prospect] = await db.select().from(prospectsTable).where(and(eq(prospectsTable.id, body.prospectId), eq(prospectsTable.clientId, req.clientId)));
  await db.insert(activityTable).values({
    clientId: req.clientId,
    type: "email_sent",
    description: `Email sent to ${prospect?.companyName ?? "prospect"}: ${body.subject}`,
    prospectId: body.prospectId,
    prospectName: prospect?.contactName ?? null,
  });
  if (body.campaignId) {
    await db.update(campaignsTable).set({ emailsSent: sql`${campaignsTable.emailsSent} + 1` }).where(and(eq(campaignsTable.id, body.campaignId), eq(campaignsTable.clientId, req.clientId)));
  }
  await db.update(prospectsTable).set({ lastContactedAt: new Date(), status: "contacted" }).where(and(eq(prospectsTable.id, body.prospectId), eq(prospectsTable.clientId, req.clientId)));
  res.status(201).json(serializeEmail(email));
});

router.patch("/:id", async (req, res) => {
  const { id } = UpdateEmailParams.parse({ id: parseInt(req.params.id) });
  const body = UpdateEmailBody.parse(req.body);
  const updateData: Record<string, unknown> = {};
  if (body.status) updateData.status = body.status;
  if (body.openedAt) updateData.openedAt = new Date(body.openedAt);
  if (body.repliedAt) updateData.repliedAt = new Date(body.repliedAt);
  const [email] = await db.update(emailsTable).set(updateData).where(and(eq(emailsTable.id, id), eq(emailsTable.clientId, req.clientId))).returning();
  if (!email) return res.status(404).json({ error: "Email not found" });
  res.json(serializeEmail(email));
});

export default router;
