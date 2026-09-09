import { Router } from "express";
import { db } from "@workspace/db";
import { emailsTable, campaignsTable, prospectsTable, activityTable, usersTable, emailLinksTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  ListEmailsQueryParams,
  CreateEmailBody,
  UpdateEmailParams,
  UpdateEmailBody,
} from "@workspace/api-zod";
import { requireAuth, requireEntitlement } from "../lib/requireAuth";
import { sendEmail } from "../lib/emailSender";
import { getClientEmailAttachments } from "../lib/clientAttachments";
import { resolveReplyTo } from "../lib/inboundAddressing";
import {
  composeEmail,
  mergeOutboundEmailTemplate,
  unsubscribeHeaders,
  hasPostalAddress,
  POSTAL_ADDRESS_REQUIRED_MESSAGE,
} from "../lib/emailCompose";

const router = Router();
router.use(requireAuth, requireEntitlement);

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

router.post("/", requireEntitlement, async (req, res) => {
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
  if (prospect.email.endsWith(".invalid")) {
    return res.status(400).json({
      error: "This prospect's email is a placeholder — a real contact email must be found before sending outreach. Use the 'Find contact' enrichment to get a verified address.",
    });
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

  // Ensure the prospect has all capability tokens (schedule, unsubscribe, reply)
  // before sending. Each token is scoped to a single capability so that disclosing
  // one (e.g. unsubscribe link in email footer) does not grant access to the others.
  let { scheduleToken, unsubscribeToken, replyToken } = prospect;
  const tokenUpdates: Record<string, string> = {};
  if (!scheduleToken) { scheduleToken = randomUUID(); tokenUpdates.scheduleToken = scheduleToken; }
  if (!unsubscribeToken) { unsubscribeToken = randomUUID(); tokenUpdates.unsubscribeToken = unsubscribeToken; }
  if (!replyToken) { replyToken = randomUUID(); tokenUpdates.replyToken = replyToken; }
  if (Object.keys(tokenUpdates).length > 0) {
    await db.update(prospectsTable).set(tokenUpdates).where(eq(prospectsTable.id, prospect.id));
  }

  const trackingToken = randomUUID();
  const subject = mergeOutboundEmailTemplate(body.subject, prospect);
  const coreBody = mergeOutboundEmailTemplate(body.body, prospect);
  const composed = composeEmail(
    coreBody,
    client,
    { companyName: prospect.companyName, unsubscribeToken },
    undefined,
    { token: trackingToken },
  );

  // Actually dispatch the email through Resend. If this fails, surface the error
  // and do NOT record it as sent.
  try {
    // Intro attachments (flyer etc.) only go on the FIRST email to a prospect —
    // repeating them on every follow-up hurts deliverability.
    const [priorEmail] = await db
      .select({ id: emailsTable.id })
      .from(emailsTable)
      .where(eq(emailsTable.prospectId, prospect.id))
      .limit(1);
    const fileAttachments = priorEmail
      ? []
      : await getClientEmailAttachments(client.attachments, req.log);
    var resendId = await sendEmail({
      attachments: fileAttachments.length > 0 ? fileAttachments : undefined,
      fromName: client.businessName?.trim() || client.outreachEmail,
      fromEmail: client.sendingEmail ?? undefined,
      replyTo: resolveReplyTo(client.outreachEmail, replyToken),
      to: prospect.email,
      subject,
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
      subject,
      body: composed.text,
      clientId: req.clientId,
      status: "sent",
      trackingToken,
      resendId: resendId ?? null,
    })
    .returning();

  if (composed.trackedLinks.length > 0) {
    await db.insert(emailLinksTable).values(composed.trackedLinks.map(l => ({
      emailId: email.id,
      clientId: req.clientId,
      prospectId: prospect.id,
      kind: l.kind,
      slug: l.slug,
      name: l.name ?? null,
      destination: l.destination,
    })));
  }

  await db.insert(activityTable).values({
    clientId: req.clientId,
    type: "email_sent",
    description: `Email sent to ${prospect.companyName}: ${subject}`,
    prospectId: body.prospectId,
    prospectName: prospect.contactName ?? null,
  });
  if (body.campaignId) {
    await db.update(campaignsTable).set({ emailsSent: sql`${campaignsTable.emailsSent} + 1` }).where(and(eq(campaignsTable.id, body.campaignId), eq(campaignsTable.clientId, req.clientId)));
  }
  await db.update(prospectsTable).set({ lastContactedAt: new Date(), status: "contacted" }).where(and(eq(prospectsTable.id, body.prospectId), eq(prospectsTable.clientId, req.clientId)));
  return res.status(201).json(serializeEmail(email));
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
  return res.json(serializeEmail(email));
});

export default router;
