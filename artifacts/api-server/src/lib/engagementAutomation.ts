import {
  db,
  automationRunsTable,
  prospectsTable,
  usersTable,
  campaignsTable,
  emailsTable,
  emailLinksTable,
  activityTable,
  autopilotEnrollmentsTable,
} from "@workspace/db";
import { eq, and, lte, gte, sql, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { sendEmail } from "./emailSender";
import { composeEmail, unsubscribeHeaders } from "./emailCompose";
import { resolveReplyTo } from "./inboundAddressing";
import { getPublicAppUrl } from "./publicUrl";
import { getEngagementSettings, isValidCalendlyUrl } from "./engagementScoring";
import { logger } from "./logger";

function mergeTpl(tpl: string, p: { contactName?: string | null; companyName?: string | null; city?: string | null; state?: string | null; industry?: string | null }): string {
  return tpl
    .replace(/\{\{contactName\}\}/g, p.contactName ?? "")
    .replace(/\{\{companyName\}\}/g, p.companyName ?? "")
    .replace(/\{\{city\}\}/g, p.city ?? "")
    .replace(/\{\{state\}\}/g, p.state ?? "")
    .replace(/\{\{industry\}\}/g, p.industry ?? "");
}

/** Prospect statuses that mean a meeting is already in motion — never nudge again. */
const MEETING_STATUSES = ["walkthrough_requested", "appointment_requested", "appointment_set", "closed_won", "closed_lost"];
const TERMINAL_STATUSES = ["unsubscribed", "invalid", "not_interested"];

async function suppress(runId: number, detail: string): Promise<void> {
  await db.update(automationRunsTable)
    .set({ status: "suppressed", resultDetail: detail })
    .where(eq(automationRunsTable.id, runId));
}

/**
 * Process due meeting-request automation runs (queued on a prospect's 3rd
 * valid open). Runs the full suppression checklist before sending; every
 * outcome is written back to the run row as the audit record.
 */
export async function processEngagementAutomation(): Promise<void> {
  const now = new Date();
  const due = await db
    .select()
    .from(automationRunsTable)
    .where(and(
      eq(automationRunsTable.status, "pending"),
      eq(automationRunsTable.automationType, "meeting_request"),
      lte(automationRunsTable.scheduledFor, now),
    ))
    .limit(20);

  for (const run of due) {
    try {
      const [prospect] = await db.select().from(prospectsTable).where(eq(prospectsTable.id, run.prospectId));
      const [client] = await db.select().from(usersTable).where(eq(usersTable.id, run.clientId));
      if (!prospect || !client) { await suppress(run.id, "Prospect or client no longer exists"); continue; }

      const settings = getEngagementSettings(client);

      // --- Suppression checklist -------------------------------------------
      if (!settings.autoFollowUpEnabled) { await suppress(run.id, "Auto follow-up disabled in settings"); continue; }
      if (prospect.optedOut) { await suppress(run.id, "Prospect unsubscribed / do-not-contact"); continue; }
      if (TERMINAL_STATUSES.includes(prospect.status)) { await suppress(run.id, `Prospect status is terminal (${prospect.status})`); continue; }
      if (MEETING_STATUSES.includes(prospect.status)) { await suppress(run.id, `Meeting already in motion (${prospect.status})`); continue; }

      // Negative reply anywhere on file suppresses the nudge.
      const [negReply] = await db.select({ id: autopilotEnrollmentsTable.id })
        .from(autopilotEnrollmentsTable)
        .where(and(
          eq(autopilotEnrollmentsTable.prospectId, prospect.id),
          eq(autopilotEnrollmentsTable.replyTone, "negative"),
        ))
        .limit(1);
      if (negReply) { await suppress(run.id, "Prospect replied negatively"); continue; }

      // Bounced last email → address is bad.
      const [bounced] = await db.select({ id: emailsTable.id })
        .from(emailsTable)
        .where(and(eq(emailsTable.prospectId, prospect.id), eq(emailsTable.status, "bounced")))
        .limit(1);
      if (bounced) { await suppress(run.id, "A previous email to this prospect bounced"); continue; }

      // Campaign must still be active (when the trigger came from a campaign).
      const [campaign] = run.campaignKey > 0
        ? await db.select().from(campaignsTable).where(eq(campaignsTable.id, run.campaignKey))
        : [undefined];
      if (run.campaignKey > 0 && (!campaign || campaign.status !== "active")) {
        await suppress(run.id, `Campaign is not active (${campaign?.status ?? "deleted"})`);
        continue;
      }

      if (!isValidCalendlyUrl(client.calendlyUrl)) { await suppress(run.id, "No valid Calendly URL configured"); continue; }
      if (!client.outreachEmail?.trim()) { await suppress(run.id, "No outreach email configured"); continue; }
      if (!client.businessAddress?.trim()) {
        // CAN-SPAM: retry later instead of suppressing forever — the client may fill it in.
        await db.update(automationRunsTable)
          .set({ scheduledFor: new Date(Date.now() + 6 * 60 * 60 * 1000), resultDetail: "Waiting for business mailing address (CAN-SPAM)" })
          .where(eq(automationRunsTable.id, run.id));
        continue;
      }

      // Daily send cap for this automation — defer to tomorrow, don't drop.
      const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
      const [{ sentToday }] = await db
        .select({ sentToday: sql<number>`count(*)::int` })
        .from(automationRunsTable)
        .where(and(
          eq(automationRunsTable.clientId, run.clientId),
          eq(automationRunsTable.status, "sent"),
          gte(automationRunsTable.sentAt, dayStart),
        ));
      if (sentToday >= settings.dailySendCap) {
        const tomorrow = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000); // 9am next day
        await db.update(automationRunsTable)
          .set({ scheduledFor: tomorrow, resultDetail: `Daily send cap (${settings.dailySendCap}) reached — deferred` })
          .where(eq(automationRunsTable.id, run.id));
        continue;
      }

      // --- Atomic claim: only one worker may flip pending → sending ---------
      const claimed = await db.update(automationRunsTable)
        .set({ status: "sending" })
        .where(and(eq(automationRunsTable.id, run.id), eq(automationRunsTable.status, "pending")))
        .returning();
      if (claimed.length === 0) continue;

      // --- Compose ----------------------------------------------------------
      const subject = mergeTpl(settings.template.subject, prospect) || `Quick 15-minute chat, ${prospect.companyName}?`;
      const coreBody = mergeTpl(settings.template.body, prospect);
      const optionB = campaign?.followUpMode === "questionnaire_first";

      // Option A: Calendly link directly. Option B: the scheduling
      // questionnaire page first (it ends with the Calendly embed).
      let ctaUrl: string;
      let ctaLabel: string;
      if (optionB) {
        let scheduleToken = prospect.scheduleToken;
        if (!scheduleToken) {
          scheduleToken = randomUUID();
          await db.update(prospectsTable).set({ scheduleToken }).where(eq(prospectsTable.id, prospect.id));
        }
        ctaUrl = `${getPublicAppUrl()}/schedule/${scheduleToken}`;
        ctaLabel = "Answer a few quick questions & pick a time";
      } else {
        ctaUrl = client.calendlyUrl!.trim();
        ctaLabel = "Pick a time for a quick 15-minute call";
      }

      const trackingToken = randomUUID();
      const composed = composeEmail(coreBody, client, prospect, { label: ctaLabel, url: ctaUrl }, { token: trackingToken });

      let resendId: string | undefined;
      try {
        resendId = await sendEmail({
          fromName: client.businessName ?? client.outreachEmail,
          fromEmail: client.sendingEmail ?? undefined,
          replyTo: resolveReplyTo(client.outreachEmail, prospect.replyToken),
          to: prospect.email,
          subject,
          body: composed.text,
          html: composed.html,
          headers: unsubscribeHeaders(composed.unsubscribeApiUrl, client.outreachEmail),
        });
      } catch (sendErr: any) {
        await db.update(automationRunsTable)
          .set({ status: "failed", resultDetail: sendErr?.message ?? "Send failed" })
          .where(eq(automationRunsTable.id, run.id));
        continue;
      }

      const sentAt = new Date();
      const [emailRow] = await db.insert(emailsTable).values({
        clientId: run.clientId,
        prospectId: prospect.id,
        campaignId: run.campaignKey > 0 ? run.campaignKey : null,
        subject,
        body: composed.text,
        status: "sent",
        sentAt,
        trackingToken,
        resendId: resendId ?? null,
      }).returning();

      if (composed.trackedLinks.length > 0) {
        await db.insert(emailLinksTable).values(composed.trackedLinks.map(l => ({
          emailId: emailRow.id,
          clientId: run.clientId,
          prospectId: prospect.id,
          kind: l.kind,
          slug: l.slug,
          name: l.name ?? null,
          destination: l.destination,
        })));
      }

      await db.update(automationRunsTable)
        .set({ status: "sent", sentAt, emailId: emailRow.id, resultDetail: optionB ? "Sent (Option B — questionnaire first)" : "Sent (Option A — meeting request)" })
        .where(eq(automationRunsTable.id, run.id));

      await db.insert(activityTable).values({
        clientId: run.clientId,
        type: "email_sent",
        description: `[Engagement] Meeting-request follow-up sent to ${prospect.companyName} after repeated opens`,
        prospectId: prospect.id,
        prospectName: prospect.contactName,
      });

      logger.info({ runId: run.id, prospectId: prospect.id, optionB }, "Repeated-open meeting-request email sent");
    } catch (err: any) {
      logger.error({ err, runId: run.id }, "Engagement automation run failed");
      await db.update(automationRunsTable)
        .set({ status: "failed", resultDetail: err?.message ?? "Unknown error" })
        .where(eq(automationRunsTable.id, run.id))
        .catch(() => {});
    }
  }
}
