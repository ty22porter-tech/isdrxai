import { Router } from "express";
import { db } from "@workspace/db";
import { emailsTable, campaignsTable, prospectsTable, activityTable, usersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  ListEmailsQueryParams,
  CreateEmailBody,
  UpdateEmailParams,
  UpdateEmailBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/requireAuth";
import { sendEmail } from "../lib/emailSender";
import {
  composeEmail,
  unsubscribeHeaders,
  hasPostalAddress,
  POSTAL_ADDRESS_REQUIRED_MESSAGE,
} from "../lib/emailCompose";

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

  // Load the prospect and the sending client (user settings) up front so we can
  // validate compliance BEFORE doing anything irreversible.
  const [prospect] = await db
    .select()
    .from(prospectsTable)
    .where(and(eq(prospectsTable.id, body.prospectId), eq(prospectsTable.clientId, req.clientId)));
  if (!prospect) return res.status(404).json({ error: "Prospect not found" });

  if (!prospect.email) {
    return res.status(400).json({ error: "This prospect has no email address." });
  }
  if (prospect.optedOut) {
    return res.status(409).json({ error: "This prospect has unsubscribed and cannot be emailed." });
  }

  const [client] = await db.select().from(usersTable).where(eq(usersTable.id, req.clientId));
  if (!client?.outreachEmail?.trim()) {
    return res.status(400).json({ error: "Add your outreach email in Settings before sending." });
  }
  if (!hasPostalAddress(client)) {
    return res.status(400).json({ error: POSTAL_ADDRESS_REQUIRED_MESSAGE });
  }

  // Ensure the prospect has a scheduling token so the unsubscribe link works.
  let scheduleToken = prospect.scheduleToken;
  if (!scheduleToken) {
    scheduleToken = randomUUID();
    await db.update(prospectsTable).set({ scheduleToken }).where(eq(prospectsTable.id, prospect.id));
  }

  const composed = composeEmail(
    body.body,
    client,
    { companyName: prospect.companyName, scheduleToken },
  );

  // Actually dispatch the email through Resend. If this fails, surface the error
  // and do NOT record it as sent.
  try {
    await sendEmail({
      fromName: client.businessName?.trim() || client.outreachEmail,
      replyTo: client.outreachEmail,
      to: prospect.email,
      subject: body.subject,
      body: composed.text,
      html: composed.html,
      headers: unsubscribeHeaders(composed.unsubscribeApiUrl, client.outreachEmail),
    });
  } catch (err: any) {
    req.log?.error?.({ err }, "Failed to send email via Resend");
    return res.status(502).json({ error: `Email could not be sent: ${err?.message ?? "unknown error"}` });
  }

  const [email] = await db
    .insert(emailsTable)
    .values({
      prospectId: body.prospectId,
      campaignId: body.campaignId,
      subject: body.subject,
      body: composed.text,
      clientId: req.clientId,
      status: "sent",
    })
    .returning();

  await db.insert(activityTable).values({
    clientId: req.clientId,
    type: "email_sent",
    description: `Email sent to ${prospect.companyName}: ${body.subject}`,
    prospectId: body.prospectId,
    prospectName: prospect.contactName ?? null,
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
