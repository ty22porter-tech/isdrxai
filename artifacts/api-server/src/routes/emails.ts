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
import { recruitingAutomationBlocked } from "../lib/recruitingResearch";
import { prospectScope, prospectRecordScope, campaignScope } from "../lib/verticalScope";
import { getClientEmailAttachments } from "../lib/clientAttachments";
import { resolveReplyTo } from "../lib/inboundAddressing";
import { guardedManualEmail, manualSequenceStep, ManualSequenceGuardError } from "../lib/giftManualEmailGuard";
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
  const conditions: any[] = [prospectRecordScope(emailsTable, req.clientId, req.dbUser?.vertical)];
  if (query.prospectId) conditions.push(eq(emailsTable.prospectId, query.prospectId));
  if (query.campaignId) conditions.push(eq(emailsTable.campaignId, query.campaignId));
  const emails = await db.select().from(emailsTable).where(and(...conditions)).orderBy(sql`${emailsTable.sentAt} desc`);
  res.json(emails.map(serializeEmail));
});

router.post("/", requireEntitlement, async (req, res) => {
  const body = CreateEmailBody.parse(req.body);
  let sequenceStep: number | undefined;
  try {
    // Read explicit sequence metadata before generated Zod can strip an additive field.
    // No metadata means an independent one-off, never infer a sequence from body text.
    sequenceStep = manualSequenceStep(req.body.sequenceStep, body.campaignId);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Invalid sequence step" });
  }

  // Load the prospect and the sending client (user settings) up front so we can
  // validate compliance BEFORE doing anything irreversible.
  const [prospect] = await db
    .select()
    .from(prospectsTable)
    .where(and(eq(prospectsTable.id, body.prospectId), prospectScope(req.clientId, req.dbUser?.vertical)));
  if (!prospect) return res.status(404).json({ error: "Prospect not found" });
  if (body.campaignId) {
    const [campaign] = await db.select({ id: campaignsTable.id }).from(campaignsTable)
      .where(and(eq(campaignsTable.id, body.campaignId), campaignScope(req.clientId, req.dbUser?.vertical)));
    if (!campaign) return res.status(404).json({ error: "Campaign not found in the selected selling industry." });
  }

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
  if (recruitingAutomationBlocked(prospect)) {
    return res.status(409).json({ error: "Recruiting outreach is suppressed because employer identity is unverified or a source prohibits agency pitches. Refresh intelligence and review the evidence." });
  }

  const [client] = await db.select().from(usersTable).where(eq(usersTable.id, req.clientId));
  if (!client?.outreachEmail?.trim()) {
    return res.status(400).json({ error: "Add your outreach email in Settings before sending." });
  }
  if (!hasPostalAddress(client)) {
    return res.status(400).json({ error: POSTAL_ADDRESS_REQUIRED_MESSAGE });
  }
  const outreachEmail = client.outreachEmail;

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
    const email = await guardedManualEmail(req.clientId, { prospectId: body.prospectId, campaignId: body.campaignId, sequenceStep }, async (store, idempotencyKey) => {
      // Intro attachments only on the first email, never repeated on follow-ups.
      const [priorEmail] = await store
        .select({ id: emailsTable.id })
        .from(emailsTable)
        .where(and(eq(emailsTable.prospectId, prospect.id), eq(emailsTable.clientId, req.clientId)))
        .limit(1);
      const fileAttachments = priorEmail ? [] : await getClientEmailAttachments(client.attachments, req.log);
      const resendId = await sendEmail({
        idempotencyKey,
        attachments: fileAttachments.length > 0 ? fileAttachments : undefined,
        fromName: client.businessName?.trim() || outreachEmail,
        fromEmail: client.sendingEmail ?? undefined,
        replyTo: resolveReplyTo(outreachEmail, replyToken),
        to: prospect.email,
        subject,
        body: composed.text,
        html: composed.html,
        headers: unsubscribeHeaders(composed.unsubscribeApiUrl, outreachEmail),
      });
      if (!resendId) throw new Error("Email provider did not acknowledge a message ID");
      const [email] = await store.insert(emailsTable).values({
        prospectId: body.prospectId,
        campaignId: body.campaignId,
        subject,
        body: composed.text,
        clientId: req.clientId,
        status: "sent",
        trackingToken,
        resendId,
      }).returning();
      if (composed.trackedLinks.length > 0) {
        await store.insert(emailLinksTable).values(composed.trackedLinks.map(l => ({
          emailId: email.id, clientId: req.clientId, prospectId: prospect.id,
          kind: l.kind, slug: l.slug, name: l.name ?? null, destination: l.destination,
        })));
      }
      await store.insert(activityTable).values({
        clientId: req.clientId,
        type: "email_sent",
        description: `Email sent to ${prospect.companyName}: ${subject}`,
        prospectId: body.prospectId,
        prospectName: prospect.contactName ?? null,
      });
      if (body.campaignId) {
        await store.update(campaignsTable).set({ emailsSent: sql`${campaignsTable.emailsSent} + 1` }).where(and(eq(campaignsTable.id, body.campaignId), eq(campaignsTable.clientId, req.clientId)));
      }
      await store.update(prospectsTable).set({ lastContactedAt: new Date(), status: "contacted" }).where(and(eq(prospectsTable.id, body.prospectId), eq(prospectsTable.clientId, req.clientId)));
      return email;
    });
    return res.status(201).json(serializeEmail(email));
  } catch (err: any) {
    if (err instanceof ManualSequenceGuardError) return res.status(err.status).json({ error: err.message });
    req.log?.error?.({ err }, "Failed to send email via Resend");
    return res.status(502).json({ error: `Email could not be sent: ${err?.message ?? "unknown error"}` });
  }
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
