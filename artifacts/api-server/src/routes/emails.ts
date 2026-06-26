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

const router = Router();

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
  const conditions = [];
  if (query.prospectId) conditions.push(eq(emailsTable.prospectId, query.prospectId));
  if (query.campaignId) conditions.push(eq(emailsTable.campaignId, query.campaignId));
  const emails = await db.select().from(emailsTable).where(conditions.length ? and(...conditions) : undefined).orderBy(sql`${emailsTable.sentAt} desc`);
  res.json(emails.map(serializeEmail));
});

router.post("/", async (req, res) => {
  const body = CreateEmailBody.parse(req.body);
  const [email] = await db.insert(emailsTable).values({ ...body, status: body.status ?? "sent" }).returning();
  const [prospect] = await db.select().from(prospectsTable).where(eq(prospectsTable.id, body.prospectId));
  await db.insert(activityTable).values({
    type: "email_sent",
    description: `Email sent to ${prospect?.companyName ?? "prospect"}: ${body.subject}`,
    prospectId: body.prospectId,
    prospectName: prospect?.contactName ?? null,
  });
  if (body.campaignId) {
    await db.update(campaignsTable).set({ emailsSent: sql`${campaignsTable.emailsSent} + 1` }).where(eq(campaignsTable.id, body.campaignId));
  }
  await db.update(prospectsTable).set({ lastContactedAt: new Date(), status: "contacted" }).where(eq(prospectsTable.id, body.prospectId));
  res.status(201).json(serializeEmail(email));
});

router.patch("/:id", async (req, res) => {
  const { id } = UpdateEmailParams.parse({ id: parseInt(req.params.id) });
  const body = UpdateEmailBody.parse(req.body);
  const updateData: Record<string, unknown> = {};
  if (body.status) updateData.status = body.status;
  if (body.openedAt) updateData.openedAt = new Date(body.openedAt);
  if (body.repliedAt) updateData.repliedAt = new Date(body.repliedAt);
  const [email] = await db.update(emailsTable).set(updateData).where(eq(emailsTable.id, id)).returning();
  if (!email) return res.status(404).json({ error: "Email not found" });
  res.json(serializeEmail(email));
});

export default router;
