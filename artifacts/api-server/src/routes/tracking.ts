import { Router } from "express";
import type { Request } from "express";
import { db, emailsTable, emailOpenEventsTable, emailLinksTable, linkClickEventsTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { getPublicAppUrl } from "../lib/publicUrl";
import { logger } from "../lib/logger";
import { recordEngagementEvent } from "../lib/engagementScoring";

/**
 * Public engagement-tracking endpoints (no auth — keyed by unguessable
 * per-email tokens). Mounted at /api/t BEFORE the Clerk middleware.
 *
 *   GET /api/t/o/:token          — open-tracking pixel (1x1 gif)
 *   GET /api/t/l/:token/:slug    — tracked link redirect (cta/website/attachment)
 *
 * The redirect only ever follows destinations stored server-side in
 * email_links, so it can't be used as an open redirect.
 */
const router = Router();

// 1x1 transparent GIF
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

const DEDUP_WINDOW_MS =
  Math.max(1, parseInt(process.env.TRACKING_DEDUP_WINDOW_MINUTES ?? "10", 10) || 10) * 60 * 1000;

/** Opens recorded this soon after send are almost certainly scanner/prefetch activity. */
const PREFETCH_GRACE_MS = 15 * 1000;

// --- Simple in-memory rate limit (per IP, per minute) -----------------------
const rlBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = rlBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    rlBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    if (rlBuckets.size > 10_000) {
      for (const [k, v] of rlBuckets) if (v.resetAt < now) rlBuckets.delete(k);
    }
    return false;
  }
  bucket.count++;
  return bucket.count > 240;
}

function getIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "";
}

/**
 * Heuristic bot/scanner detection. NOTE: GoogleImageProxy is Gmail's image
 * proxy for real human opens — it must NOT be treated as a bot. Apple Mail
 * Privacy Protection prefetches are largely indistinguishable; the sub-15s
 * prefetch grace period is the main guard, which is why opens are labeled an
 * estimate.
 */
function botReason(userAgent: string): string | null {
  const ua = userAgent.toLowerCase();
  if (!ua) return "no-user-agent";
  const patterns: [RegExp, string][] = [
    [/barracuda|mimecast|proofpoint|forcepoint|fireeye|trendmicro|symantec|sophos|zscaler|urldefense/, "security-scanner"],
    [/bot\b|crawler|spider|slurp|headless|phantomjs|selenium/, "bot"],
    [/curl|wget|python-requests|python-urllib|go-http-client|okhttp|java\/|libwww/, "http-client"],
    [/outlook-ios-fetcher|ms-office.*prefetch|bingpreview/, "prefetch"],
  ];
  for (const [re, reason] of patterns) if (re.test(ua)) return reason;
  return null;
}

// --- Open pixel --------------------------------------------------------------
router.get("/o/:token", async (req, res) => {
  // Always answer with the pixel immediately — tracking must never break rendering.
  res.set({
    "Content-Type": "image/gif",
    "Content-Length": String(PIXEL.length),
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.end(PIXEL);

  const ip = getIp(req);
  if (rateLimited(ip)) return;
  const token = req.params.token;
  if (!token || token.length > 64) return;
  const userAgent = ((req.headers["user-agent"] as string) ?? "").slice(0, 500);

  try {
    const [email] = await db.select().from(emailsTable).where(eq(emailsTable.trackingToken, token));
    if (!email) return;

    const now = new Date();
    const reason = botReason(userAgent);
    const withinPrefetchGrace = now.getTime() - email.sentAt.getTime() < PREFETCH_GRACE_MS;
    const effectiveReason = reason ?? (withinPrefetchGrace ? "prefetch-window" : null);
    const isBot = !!effectiveReason;

    // Dedup check + event insert + counter update run in one transaction,
    // serialized per email+IP+UA via an advisory lock so two concurrent hits
    // in the window can't both count as valid opens.
    let countedValidOpen = false;
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${token}|${ip}|${userAgent}`}))`);

      const windowStart = new Date(now.getTime() - DEDUP_WINDOW_MS);
      const [recent] = await tx
        .select({ id: emailOpenEventsTable.id })
        .from(emailOpenEventsTable)
        .where(and(
          eq(emailOpenEventsTable.emailId, email.id),
          eq(emailOpenEventsTable.ip, ip),
          eq(emailOpenEventsTable.userAgent, userAgent),
          gte(emailOpenEventsTable.openedAt, windowStart),
        ))
        .limit(1);
      const isValid = !isBot && !recent;
      countedValidOpen = isValid;

      await tx.insert(emailOpenEventsTable).values({
        emailId: email.id,
        clientId: email.clientId,
        prospectId: email.prospectId,
        ip,
        userAgent,
        isBot,
        botReason: effectiveReason,
        isValid,
      });

      await tx.update(emailsTable)
        .set({
          totalOpens: sql`${emailsTable.totalOpens} + 1`,
          validOpens: isValid ? sql`${emailsTable.validOpens} + 1` : emailsTable.validOpens,
          lastOpenedAt: now,
          openedAt: email.openedAt ?? (isValid ? now : email.openedAt),
        })
        .where(eq(emailsTable.id, email.id));
    });

    // Interest scoring + repeated-open follow-up trigger (never throws).
    if (countedValidOpen) {
      await recordEngagementEvent(email.prospectId, "open", { emailId: email.id, campaignId: email.campaignId });
    }
  } catch (err) {
    logger.error({ err }, "Open-tracking event failed");
  }
});

// --- Tracked link redirect ----------------------------------------------------
router.get("/l/:token/:slug", async (req, res) => {
  const base = getPublicAppUrl();
  const ip = getIp(req);
  const { token, slug } = req.params;
  try {
    if (rateLimited(ip) || !token || token.length > 64) return res.redirect(base || "/");
    const [email] = await db.select().from(emailsTable).where(eq(emailsTable.trackingToken, token));
    if (!email) return res.redirect(base || "/");
    const [link] = await db
      .select()
      .from(emailLinksTable)
      .where(and(eq(emailLinksTable.emailId, email.id), eq(emailLinksTable.slug, slug)));
    if (!link) return res.redirect(base || "/");

    const userAgent = ((req.headers["user-agent"] as string) ?? "").slice(0, 500);
    const isBot = !!botReason(userAgent);
    const isDownload = req.query.dl === "1" && link.kind === "attachment";

    // Attachment destinations are storage paths served by the app; everything
    // else is the absolute URL stored at send time.
    const target = link.kind === "attachment" ? `${base}/api/storage${link.destination}` : link.destination;
    res.redirect(target);

    db.insert(linkClickEventsTable).values({
      linkId: link.id,
      emailId: email.id,
      clientId: email.clientId,
      prospectId: email.prospectId,
      eventType: isDownload ? "download" : "click",
      ip,
      userAgent,
      isBot,
    }).then(async () => {
      if (isBot) return;
      await db.update(emailLinksTable)
        .set(isDownload
          ? { downloadCount: sql`${emailLinksTable.downloadCount} + 1`, lastClickedAt: new Date() }
          : { clickCount: sql`${emailLinksTable.clickCount} + 1`, lastClickedAt: new Date() })
        .where(eq(emailLinksTable.id, link.id));

      // Interest scoring: cta links are scheduling/Calendly links, attachments
      // are collateral views; anything else is a plain link click.
      const eventType = link.kind === "cta" ? "calendly_click" : link.kind === "attachment" ? "attachment_view" : "link_click";
      await recordEngagementEvent(email.prospectId, eventType, {
        emailId: email.id,
        campaignId: email.campaignId,
        detail: link.name ?? link.kind,
      });
    }).catch((err) => logger.error({ err }, "Link-click event failed"));
  } catch (err) {
    logger.error({ err }, "Tracked link redirect failed");
    if (!res.headersSent) res.redirect(base || "/");
  }
});

export default router;
