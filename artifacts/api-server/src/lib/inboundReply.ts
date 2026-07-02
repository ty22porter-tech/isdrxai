import {
  db,
  autopilotEnrollmentsTable,
  prospectsTable,
  usersTable,
  activityTable,
  processedInboundEmailsTable,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Resend } from "resend";
import { sendEmail } from "./emailSender";
import { analyzeReplyTone, processAutopilotQueue } from "./autopilotEngine";
import { extractAddress, parseTokenFromRecipients } from "./inboundAddressing";
import { logger } from "./logger";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set.");
    _resend = new Resend(key);
  }
  return _resend;
}

// Enrollment states that can still receive/react to a prospect reply.
const LIVE_ENROLLMENT_STATES = ["active", "paused", "replied", "calendly_sent"];

function stripHtml(html?: string | null): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Handle a verified Resend webhook event. Only `email.received` (inbound reply)
 * events are acted on; everything else is ignored. This is a no-op unless the
 * inbound recipient encodes a known prospect scheduleToken.
 */
export async function handleResendWebhookEvent(event: {
  type: string;
  data: { email_id: string; from: string; to: string[]; cc?: string[]; subject?: string };
}): Promise<void> {
  if (event.type !== "email.received") return;

  const { email_id, from, to, subject } = event.data;
  if (!email_id) return;

  // Idempotency: Resend can retry/replay the same event. Record the email_id
  // first; if it's already there, we've handled this inbound email — stop.
  const claimed = await db
    .insert(processedInboundEmailsTable)
    .values({ emailId: email_id })
    .onConflictDoNothing()
    .returning();
  if (claimed.length === 0) {
    logger.info({ email_id }, "Inbound reply skipped: already processed");
    return;
  }

  // If anything below throws unexpectedly (DB/network), release the dedup marker
  // so the message can be reprocessed on a manual replay rather than being lost.
  // Intentional early returns (no token / no prospect) keep the marker — those
  // are permanent, non-retriable skips.
  try {
  const recipients = [...(to ?? []), ...(event.data.cc ?? [])];
  const token = parseTokenFromRecipients(recipients);
  if (!token) {
    logger.warn({ email_id, to }, "Inbound reply ignored: no reply token in recipients");
    return;
  }

  const [prospect] = await db
    .select()
    .from(prospectsTable)
    .where(eq(prospectsTable.scheduleToken, token));
  if (!prospect) {
    logger.warn({ email_id, token }, "Inbound reply ignored: no prospect for token");
    return;
  }

  const [client] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, prospect.clientId));

  // The webhook payload is metadata-only; fetch the actual body.
  let replyText = "";
  try {
    const { data } = await getResend().emails.receiving.get(email_id);
    replyText = (data?.text?.trim() || stripHtml(data?.html)).trim();
  } catch (err) {
    logger.error({ err, email_id }, "Inbound reply: failed to fetch email body");
  }
  if (!replyText) replyText = subject ? `(no readable body) Subject: ${subject}` : "(no readable body)";

  const tone = await analyzeReplyTone(replyText).catch(() => "neutral" as const);

  // Sender validation: the tokenized reply address is exposed in outbound headers,
  // so anyone could email it. Only advance the funnel when the sender actually
  // matches the prospect we emailed. Unverified mail is forwarded to the client
  // for visibility but never mutates enrollment state or triggers a send.
  const senderAddr = (from ? extractAddress(from) : "").toLowerCase();
  const senderVerified = !!senderAddr && senderAddr === prospect.email.trim().toLowerCase();

  if (senderVerified) {
    // Attach the reply to the prospect's most recent live enrollment (if any).
    // Only the FIRST reply advances the sequence — once a scheduling link has
    // been sent (calendlyLinkSentAt) we record the reply but don't reset the funnel.
    const [enrollment] = await db
      .select()
      .from(autopilotEnrollmentsTable)
      .where(
        and(
          eq(autopilotEnrollmentsTable.prospectId, prospect.id),
          inArray(autopilotEnrollmentsTable.status, LIVE_ENROLLMENT_STATES),
        ),
      )
      .orderBy(desc(autopilotEnrollmentsTable.createdAt))
      .limit(1);

    if (enrollment) {
      const alreadyAdvanced = !!enrollment.calendlyLinkSentAt;
      await db
        .update(autopilotEnrollmentsTable)
        .set({
          status: alreadyAdvanced ? enrollment.status : "replied",
          repliedAt: enrollment.repliedAt ?? new Date(),
          replyContent: replyText,
          replyTone: tone,
        })
        .where(eq(autopilotEnrollmentsTable.id, enrollment.id));
    }

    await db.insert(activityTable).values({
      clientId: prospect.clientId,
      type: "reply_received",
      description: `[Auto] Reply received from ${prospect.contactName} at ${prospect.companyName} (tone: ${tone})`,
      prospectId: prospect.id,
      prospectName: prospect.contactName,
    });

    // Trigger the queue so a positive reply fires the scheduling email within minutes.
    processAutopilotQueue().catch(() => {});

    logger.info(
      { prospectId: prospect.id, enrollmentId: enrollment?.id, tone },
      "Inbound reply processed",
    );
  } else {
    logger.warn(
      { email_id, prospectId: prospect.id, from },
      "Inbound reply: sender does not match prospect — forwarding only, no auto-action",
    );
  }

  // Forward a copy to the client's real inbox so they still see every reply.
  // Reply-To is set to the sender so the client can respond to them directly.
  if (client?.outreachEmail?.trim()) {
    try {
      const replyToAddr = senderAddr || prospect.email;
      const note = senderVerified
        ? `— Reply directly to this email to respond to ${prospect.contactName}.`
        : `⚠️ This came to ${prospect.contactName}'s reply address but from an unrecognized sender (${from}); it was NOT auto-processed. Reply directly to respond.`;
      await sendEmail({
        fromName: `${prospect.companyName} (via AI SDR)`,
        replyTo: replyToAddr,
        to: client.outreachEmail,
        subject: `Reply from ${prospect.contactName} — ${prospect.companyName}`,
        body:
          `${prospect.contactName} at ${prospect.companyName} replied to your outreach ` +
          `(detected tone: ${tone}):\n\n` +
          `${replyText}\n\n` +
          `${note}`,
      });
    } catch (err) {
      logger.error({ err, prospectId: prospect.id }, "Inbound reply: failed to forward copy to client");
    }
  }
  } catch (err) {
    await db
      .delete(processedInboundEmailsTable)
      .where(eq(processedInboundEmailsTable.emailId, email_id))
      .catch(() => {});
    logger.error({ err, email_id }, "Inbound reply processing failed; released dedup marker for retry");
  }
}
