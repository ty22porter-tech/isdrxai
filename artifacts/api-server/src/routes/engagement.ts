import { Router } from "express";
import { db, emailsTable, emailLinksTable, emailOpenEventsTable, linkClickEventsTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { requireAuth } from "../lib/requireAuth";

/**
 * Engagement summary APIs (authenticated, tenant-scoped). Consumed by the
 * upcoming interest-scoring and dashboard features.
 */
const router = Router();
router.use(requireAuth);

// Client-wide engagement summary.
router.get("/summary", async (req, res) => {
  const clientId = req.clientId;

  const [emailAgg] = await db
    .select({
      emailsSent: sql<number>`count(*)::int`,
      emailsDelivered: sql<number>`count(*) filter (where ${emailsTable.deliveredAt} is not null)::int`,
      emailsBounced: sql<number>`count(*) filter (where ${emailsTable.bouncedAt} is not null)::int`,
      totalOpens: sql<number>`coalesce(sum(${emailsTable.totalOpens}), 0)::int`,
      validOpens: sql<number>`coalesce(sum(${emailsTable.validOpens}), 0)::int`,
    })
    .from(emailsTable)
    .where(eq(emailsTable.clientId, clientId));

  // Per-prospect valid-open totals drive "prospects who opened" and
  // "repeated-open prospects" (3+ valid opens).
  const prospectOpens = await db
    .select({
      prospectId: emailsTable.prospectId,
      validOpens: sql<number>`coalesce(sum(${emailsTable.validOpens}), 0)::int`,
    })
    .from(emailsTable)
    .where(eq(emailsTable.clientId, clientId))
    .groupBy(emailsTable.prospectId);
  const prospectsWhoOpened = prospectOpens.filter(p => p.validOpens > 0).length;
  const repeatedOpenProspects = prospectOpens.filter(p => p.validOpens >= 3).length;

  const [linkAgg] = await db
    .select({
      linksClicked: sql<number>`coalesce(sum(${emailLinksTable.clickCount}) filter (where ${emailLinksTable.kind} != 'attachment'), 0)::int`,
      attachmentsViewed: sql<number>`count(*) filter (where ${emailLinksTable.kind} = 'attachment' and ${emailLinksTable.clickCount} > 0)::int`,
      attachmentDownloads: sql<number>`coalesce(sum(${emailLinksTable.downloadCount}), 0)::int`,
      calendlyClicks: sql<number>`coalesce(sum(${emailLinksTable.clickCount}) filter (where ${emailLinksTable.kind} = 'cta'), 0)::int`,
    })
    .from(emailLinksTable)
    .where(eq(emailLinksTable.clientId, clientId));

  res.json({
    emailsSent: emailAgg?.emailsSent ?? 0,
    emailsDelivered: emailAgg?.emailsDelivered ?? 0,
    emailsBounced: emailAgg?.emailsBounced ?? 0,
    totalOpens: emailAgg?.totalOpens ?? 0,
    validOpens: emailAgg?.validOpens ?? 0,
    prospectsWhoOpened,
    repeatedOpenProspects,
    linksClicked: linkAgg?.linksClicked ?? 0,
    attachmentsViewed: linkAgg?.attachmentsViewed ?? 0,
    attachmentDownloads: linkAgg?.attachmentDownloads ?? 0,
    calendlyClicks: linkAgg?.calendlyClicks ?? 0,
  });
});

// Per-prospect engagement detail: emails with open counts, tracked links with
// view state, and the raw event history (for the future timeline).
router.get("/prospects/:id", async (req, res) => {
  const prospectId = parseInt(req.params.id, 10);
  if (isNaN(prospectId)) return res.status(400).json({ error: "Invalid prospect id" });
  const clientId = req.clientId;

  const emails = await db
    .select({
      id: emailsTable.id,
      subject: emailsTable.subject,
      status: emailsTable.status,
      sentAt: emailsTable.sentAt,
      deliveredAt: emailsTable.deliveredAt,
      bouncedAt: emailsTable.bouncedAt,
      totalOpens: emailsTable.totalOpens,
      validOpens: emailsTable.validOpens,
      lastOpenedAt: emailsTable.lastOpenedAt,
      repliedAt: emailsTable.repliedAt,
    })
    .from(emailsTable)
    .where(and(eq(emailsTable.clientId, clientId), eq(emailsTable.prospectId, prospectId)))
    .orderBy(desc(emailsTable.sentAt));

  const links = await db
    .select()
    .from(emailLinksTable)
    .where(and(eq(emailLinksTable.clientId, clientId), eq(emailLinksTable.prospectId, prospectId)));

  const attachmentStatus = (l: typeof links[number]) =>
    l.downloadCount > 0 ? "Downloaded"
      : l.clickCount > 1 ? "Viewed Multiple Times"
      : l.clickCount === 1 ? "Viewed"
      : "Not Viewed";

  const openEvents = await db
    .select()
    .from(emailOpenEventsTable)
    .where(and(eq(emailOpenEventsTable.clientId, clientId), eq(emailOpenEventsTable.prospectId, prospectId)))
    .orderBy(desc(emailOpenEventsTable.openedAt))
    .limit(200);

  const clickEvents = await db
    .select()
    .from(linkClickEventsTable)
    .where(and(eq(linkClickEventsTable.clientId, clientId), eq(linkClickEventsTable.prospectId, prospectId)))
    .orderBy(desc(linkClickEventsTable.clickedAt))
    .limit(200);

  res.json({
    emails: emails.map(e => ({
      ...e,
      sentAt: e.sentAt.toISOString(),
      deliveredAt: e.deliveredAt?.toISOString() ?? null,
      bouncedAt: e.bouncedAt?.toISOString() ?? null,
      lastOpenedAt: e.lastOpenedAt?.toISOString() ?? null,
      repliedAt: e.repliedAt?.toISOString() ?? null,
    })),
    links: links.map(l => ({
      id: l.id,
      emailId: l.emailId,
      kind: l.kind,
      name: l.name,
      clickCount: l.clickCount,
      downloadCount: l.downloadCount,
      lastClickedAt: l.lastClickedAt?.toISOString() ?? null,
      status: l.kind === "attachment" ? attachmentStatus(l) : undefined,
    })),
    openEvents: openEvents.map(e => ({
      id: e.id,
      emailId: e.emailId,
      openedAt: e.openedAt.toISOString(),
      isBot: e.isBot,
      botReason: e.botReason,
      isValid: e.isValid,
    })),
    clickEvents: clickEvents.map(e => ({
      id: e.id,
      emailId: e.emailId,
      linkId: e.linkId,
      eventType: e.eventType,
      clickedAt: e.clickedAt.toISOString(),
      isBot: e.isBot,
    })),
  });
});

export default router;
