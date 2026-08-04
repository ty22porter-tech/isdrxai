import {
  db,
  autopilotEnrollmentsTable,
  prospectsTable,
  usersTable,
  activityTable,
  processedInboundEmailsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { Resend } from "resend";
import { sendEmail } from "./emailSender";
import { analyzeReplyTone, processAutopilotQueue } from "./autopilotEngine";
import { extractAddress, parseTokenFromRecipients } from "./inboundAddressing";
import { recordEngagementEvent, cancelPendingAutomation } from "./engagementScoring";
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
 * Check whether the fetched email headers provide sufficient authentication
 * evidence that the sender is who the From address claims.
 *
 * This function requires dmarc=pass in the Authentication-Results header.
 * DMARC (RFC 7489) is the only check used here because it is the only
 * mechanism that simultaneously verifies message authentication AND enforces
 * alignment between the authentication domain and the visible From header
 * domain. Alternatives considered and rejected:
 *
 *   - Bare dkim=pass: attacker can DKIM-sign with their own domain while
 *     spoofing the From address — dkim=pass for the wrong domain.
 *
 *   - Aligned dkim=pass via header.i/header.d matching: requires PSL-aware
 *     registrable-domain extraction to be correct. Naive "last-two-labels"
 *     logic incorrectly treats attacker.co.uk as aligned with victim.co.uk.
 *     Bundling a PSL dependency just for this check adds maintenance surface
 *     with no clear benefit over the simpler dmarc=pass check.
 *
 *   - spf=pass: SPF authenticates the envelope sender (MAIL FROM), not the
 *     visible From header, so it can be spoofed for From while SPF passes.
 *
 * Fail-closed: absent, ambiguous, or non-dmarc-pass results are all treated
 * as unverified. Unverified replies are forwarded to the client for manual
 * inspection but never mutate enrollment state or trigger automated sends.
 *
 * Authentication-Results headers are injected by the receiving MTA and are
 * not modifiable by the sender after delivery.
 */
/**
 * Normalize headers from whatever shape the provider returns into an iterable
 * of [name, value] pairs, supporting both:
 *   - Record<string, string>  — object keyed by header name (Resend's actual shape)
 *   - Array<{name, value}>    — array of header objects (defensive fallback)
 */
function iterateHeaders(
  raw: unknown,
): Iterable<readonly [string, string]> {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((h): h is { name: string; value: string } =>
        h !== null && typeof h === "object" && typeof h.name === "string" && typeof h.value === "string",
      )
      .map((h) => [h.name, h.value] as const);
  }
  if (typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .filter((e): e is [string, string] => typeof e[1] === "string");
  }
  return [];
}

function hasSufficientAuth(rawHeaders: unknown): boolean {
  for (const [name, value] of iterateHeaders(rawHeaders)) {
    if (name.toLowerCase() === "authentication-results") {
      if (/\bdmarc=pass\b/i.test(value)) return true;
    }
  }
  return false;
}

/**
 * Handle a verified Resend webhook event. Only `email.received` (inbound reply)
 * events are acted on; everything else is ignored. This is a no-op unless the
 * inbound recipient encodes a known prospect replyToken.
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
  // parseTokenFromRecipients decodes the replyToken from the reply-<token>@domain address.
  const token = parseTokenFromRecipients(recipients);
  if (!token) {
    logger.warn({ email_id, to }, "Inbound reply ignored: no reply token in recipients");
    return;
  }

  // Look up prospect by replyToken (not scheduleToken) so that the reply-to
  // address cannot be used to access scheduling or unsubscribe flows.
  // Dual-token fallback: also accept scheduleToken for replies to emails that
  // were sent before the token split, so existing reply-to aliases keep working
  // during the rollout window. Can be removed once historic campaigns cycle out.
  const [prospect] = await db
    .select()
    .from(prospectsTable)
    .where(or(eq(prospectsTable.replyToken, token), eq(prospectsTable.scheduleToken, token))!);
  if (!prospect) {
    logger.warn({ email_id, token }, "Inbound reply ignored: no prospect for token");
    return;
  }

  const [client] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, prospect.clientId));

  // The webhook payload is metadata-only; fetch the actual body and headers.
  // data.headers from Resend may be Record<string,string> (object) or an
  // array of {name,value} — hasSufficientAuth handles both via iterateHeaders().
  let replyText = "";
  let rawEmailHeaders: unknown = null;
  try {
    const { data } = await getResend().emails.receiving.get(email_id);
    replyText = (data?.text?.trim() || stripHtml(data?.html)).trim();
    rawEmailHeaders = (data as any)?.headers ?? null;
  } catch (err) {
    logger.error({ err, email_id }, "Inbound reply: failed to fetch email body");
  }
  if (!replyText) replyText = subject ? `(no readable body) Subject: ${subject}` : "(no readable body)";

  const tone = await analyzeReplyTone(replyText).catch(() => "neutral" as const);

  // Sender validation: the tokenized reply address is exposed in outbound headers,
  // so anyone could email it. Only advance the funnel when BOTH conditions hold:
  //   1. The From address matches the prospect's email (string check).
  //   2. The message passes DKIM authentication (header injected by the receiving
  //      MTA — not forgeable by the sender), confirming the message actually
  //      originated from the domain it claims.
  // Failing either check logs a warning and forwards to the client without
  // mutating enrollment state or triggering automated sends.
  const senderAddr = (from ? extractAddress(from) : "").toLowerCase();
  const fromMatches = !!senderAddr && senderAddr === prospect.email.trim().toLowerCase();
  const authVerified = hasSufficientAuth(rawEmailHeaders);
  const senderVerified = fromMatches && authVerified;

  if (!fromMatches) {
    logger.warn(
      { email_id, prospectId: prospect.id, from },
      "Inbound reply: From address does not match prospect — forwarding only, no auto-action",
    );
  } else if (!authVerified) {
    logger.warn(
      { email_id, prospectId: prospect.id, from },
      "Inbound reply: From address matches but DMARC/aligned-DKIM did not pass — forwarding only, no auto-action",
    );
  }

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
    } else if (tone === "positive") {
      // The prospect was emailed outside an autopilot sequence (manual/one-off
      // send), so there is no enrollment to advance — but a verified positive
      // reply should still trigger the scheduling email. Create a minimal
      // enrollment in "replied" state so processAutopilotQueue() picks it up
      // and sends the questionnaire + Calendly email through the same
      // idempotent path (atomic claim, CAN-SPAM checks) as sequenced prospects.
      // Only positive tones get a row: the engine ignores non-positive
      // "replied" rows, and letting them accumulate would clog its scan.
      await db.insert(autopilotEnrollmentsTable).values({
        clientId: prospect.clientId,
        prospectId: prospect.id,
        status: "replied",
        repliedAt: new Date(),
        replyContent: replyText,
        replyTone: tone,
      });
    }

    // Interest scoring: positive replies add points; negative replies set a
    // terminal status and cancel any pending repeated-open follow-up.
    if (tone === "positive") {
      await recordEngagementEvent(prospect.id, "positive_reply").catch(() => {});
    } else if (tone === "negative") {
      await cancelPendingAutomation(prospect.id, "Prospect replied negatively");
      await db.update(prospectsTable)
        .set({ status: "not_interested" })
        .where(eq(prospectsTable.id, prospect.id))
        .catch(() => {});
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
  }

  // Forward a copy to the client's real inbox so they still see every reply.
  // Reply-To is set to the sender so the client can respond to them directly.
  if (client?.outreachEmail?.trim()) {
    try {
      const replyToAddr = senderAddr || prospect.email;
      const note = senderVerified
        ? `— Reply directly to this email to respond to ${prospect.contactName}.`
        : fromMatches
          ? `⚠️ This came to ${prospect.contactName}'s reply address but DMARC/aligned-DKIM authentication did not pass (possible spoofing attempt from ${from}); it was NOT auto-processed. Reply directly to respond if legitimate.`
          : `⚠️ This came to ${prospect.contactName}'s reply address but from an unrecognized sender (${from}); it was NOT auto-processed. Reply directly to respond.`;
      await sendEmail({
        fromName: `${prospect.companyName} (via iSDRX AI)`,
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
