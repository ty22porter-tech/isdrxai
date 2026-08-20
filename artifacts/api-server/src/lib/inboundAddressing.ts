// Inbound reply routing (Option B): outgoing prospect emails carry a Reply-To on
// the platform's receiving subdomain that encodes the prospect's replyToken.
// When a prospect replies, Resend delivers it to our webhook and we decode the
// token to match the reply back to the right prospect/enrollment.
//
// replyToken is intentionally separate from scheduleToken and unsubscribeToken
// so that disclosing the reply-to address does not grant access to the
// scheduling or unsubscribe flows, and vice-versa.
//
// This module is intentionally dependency-free (no DB, no engine imports) so it
// can be used both by the outgoing send paths and the inbound webhook handler
// without creating an import cycle.

const REPLY_PREFIX = "reply-";

/**
 * The domain (or subdomain) configured in Resend to receive inbound email, e.g.
 * "reply.sdrai.xyz". Returns null when inbound routing is not yet configured, in
 * which case outgoing email falls back to the client's own outreach inbox.
 */
export function getInboundReplyDomain(): string | null {
  const raw = process.env.INBOUND_REPLY_DOMAIN?.trim();
  if (!raw) return null;
  return raw.replace(/^@/, "").toLowerCase();
}

/**
 * Resolve the Reply-To address for an outgoing prospect email. When inbound
 * routing is configured and the prospect has a replyToken, replies are routed
 * through the platform (reply-<replyToken>@<domain>); otherwise they go
 * straight to the client's own outreach inbox.
 *
 * Uses replyToken (not scheduleToken) so that learning the reply-to address
 * does not also grant access to the scheduling questionnaire.
 */
export function resolveReplyTo(
  outreachEmail: string,
  replyToken: string | null | undefined,
): string {
  const domain = getInboundReplyDomain();
  if (domain && replyToken) {
    return `${REPLY_PREFIX}${replyToken}@${domain}`;
  }
  return outreachEmail;
}

/** Extract the bare email address from a raw header value ("Name <a@b>" -> "a@b"). */
export function extractAddress(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim();
}

/**
 * Given the recipient addresses of an inbound email, return the replyToken
 * encoded in the first matching reply-<token>@<inbound-domain> address, or null.
 */
export function parseTokenFromRecipients(recipients: string[]): string | null {
  const domain = getInboundReplyDomain();
  if (!domain) return null;
  for (const raw of recipients) {
    const addr = extractAddress(raw).toLowerCase();
    const at = addr.lastIndexOf("@");
    if (at < 0) continue;
    const local = addr.slice(0, at);
    const host = addr.slice(at + 1);
    if (host !== domain) continue;
    if (!local.startsWith(REPLY_PREFIX)) continue;
    const token = local.slice(REPLY_PREFIX.length).trim();
    if (token) return token;
  }
  return null;
}
