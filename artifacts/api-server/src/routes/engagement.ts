import { Router } from "express";
import {
  db,
  emailsTable,
  emailLinksTable,
  emailOpenEventsTable,
  linkClickEventsTable,
  prospectsTable,
  scoreEventsTable,
  automationRunsTable,
  appointmentsTable,
  campaignsTable,
} from "@workspace/db";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { requireAuth, requireEntitlement } from "../lib/requireAuth";
import { recommendedNextAction } from "../lib/nextAction";
import { matchesEngagementSearch } from "../lib/engagementSearch";
import { CALENDLY_CLICK_FOLLOW_UP_TYPE } from "../lib/calendlyConversion";

/**
 * Engagement summary APIs (authenticated, tenant-scoped). Consumed by the
 * upcoming interest-scoring and dashboard features.
 */
const router = Router();
router.use(requireAuth, requireEntitlement);

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

  // "Filtered bot activity" indicator: automated scanner hits we recorded but
  // excluded from scoring and from the human click/open counts above.
  const [botAgg] = await db
    .select({ botClicksFiltered: sql<number>`count(*) filter (where ${linkClickEventsTable.isBot})::int` })
    .from(linkClickEventsTable)
    .where(eq(linkClickEventsTable.clientId, clientId));
  const [botOpenAgg] = await db
    .select({ botOpensFiltered: sql<number>`count(*) filter (where ${emailOpenEventsTable.isBot})::int` })
    .from(emailOpenEventsTable)
    .where(eq(emailOpenEventsTable.clientId, clientId));

  // Interest level counts use the EFFECTIVE level (manual override wins).
  const levelRows = await db
    .select({
      level: sql<string>`coalesce(${prospectsTable.manualInterestLevel}, ${prospectsTable.interestLevel}, 'low')`,
      n: sql<number>`count(*)::int`,
    })
    .from(prospectsTable)
    .where(eq(prospectsTable.clientId, clientId))
    .groupBy(sql`coalesce(${prospectsTable.manualInterestLevel}, ${prospectsTable.interestLevel}, 'low')`);
  const levelCount = (l: string) => levelRows.find(r => r.level === l)?.n ?? 0;

  const [autoAgg] = await db
    .select({
      meetingRequestsSent: sql<number>`count(*) filter (where ${automationRunsTable.status} = 'sent')::int`,
    })
    .from(automationRunsTable)
    .where(and(
      eq(automationRunsTable.clientId, clientId),
      inArray(automationRunsTable.automationType, ["meeting_request", CALENDLY_CLICK_FOLLOW_UP_TYPE]),
    ));

  const [apptAgg] = await db
    .select({ meetingsScheduled: sql<number>`count(*)::int` })
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.clientId, clientId), sql`${appointmentsTable.status} != 'cancelled'`));

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
    botClicksFiltered: botAgg?.botClicksFiltered ?? 0,
    botOpensFiltered: botOpenAgg?.botOpensFiltered ?? 0,
    hotProspects: levelCount("hot"),
    mediumProspects: levelCount("medium"),
    lowProspects: levelCount("low"),
    meetingRequestsSent: autoAgg?.meetingRequestsSent ?? 0,
    meetingsScheduled: apptAgg?.meetingsScheduled ?? 0,
  });
});

// ─── Engagement table ────────────────────────────────────────────────────────
// Per-prospect engagement rows with sort / filter / search / pagination and
// CSV export (?format=csv streams the FULL filtered set, not just one page).
router.get("/table", async (req, res) => {
  const clientId = req.clientId;
  const q = req.query as Record<string, string | undefined>;

  const prospects = await db.select().from(prospectsTable).where(eq(prospectsTable.clientId, clientId));

  const emailAggs = await db
    .select({
      prospectId: emailsTable.prospectId,
      emailsSent: sql<number>`count(*)::int`,
      emailsDelivered: sql<number>`count(*) filter (where ${emailsTable.deliveredAt} is not null)::int`,
      emailsBounced: sql<number>`count(*) filter (where ${emailsTable.bouncedAt} is not null)::int`,
      totalOpens: sql<number>`coalesce(sum(${emailsTable.totalOpens}), 0)::int`,
      validOpens: sql<number>`coalesce(sum(${emailsTable.validOpens}), 0)::int`,
      lastOpenedAt: sql<string | null>`max(${emailsTable.lastOpenedAt})`,
      campaignIds: sql<number[]>`array_remove(array_agg(distinct ${emailsTable.campaignId}), null)`,
    })
    .from(emailsTable)
    .where(eq(emailsTable.clientId, clientId))
    .groupBy(emailsTable.prospectId);
  const emailByProspect = new Map(emailAggs.map(r => [r.prospectId, r]));

  const linkAggs = await db
    .select({
      prospectId: emailLinksTable.prospectId,
      linksClicked: sql<number>`coalesce(sum(${emailLinksTable.clickCount}) filter (where ${emailLinksTable.kind} != 'attachment'), 0)::int`,
      attachmentViews: sql<number>`coalesce(sum(${emailLinksTable.clickCount}) filter (where ${emailLinksTable.kind} = 'attachment'), 0)::int`,
      attachmentDownloads: sql<number>`coalesce(sum(${emailLinksTable.downloadCount}), 0)::int`,
      calendlyClicks: sql<number>`coalesce(sum(${emailLinksTable.clickCount}) filter (where ${emailLinksTable.kind} = 'cta'), 0)::int`,
    })
    .from(emailLinksTable)
    .where(eq(emailLinksTable.clientId, clientId))
    .groupBy(emailLinksTable.prospectId);
  const linkByProspect = new Map(linkAggs.map(r => [r.prospectId, r]));

  // Per-prospect bot-filtered activity (scanner hits excluded from scoring).
  const botOpenAggs = await db
    .select({
      prospectId: emailOpenEventsTable.prospectId,
      botOpens: sql<number>`count(*) filter (where ${emailOpenEventsTable.isBot})::int`,
    })
    .from(emailOpenEventsTable)
    .where(eq(emailOpenEventsTable.clientId, clientId))
    .groupBy(emailOpenEventsTable.prospectId);
  const botOpensByProspect = new Map(botOpenAggs.map(r => [r.prospectId, r.botOpens]));

  const botClickAggs = await db
    .select({
      prospectId: linkClickEventsTable.prospectId,
      botClicks: sql<number>`count(*) filter (where ${linkClickEventsTable.isBot})::int`,
    })
    .from(linkClickEventsTable)
    .where(eq(linkClickEventsTable.clientId, clientId))
    .groupBy(linkClickEventsTable.prospectId);
  const botClicksByProspect = new Map(botClickAggs.map(r => [r.prospectId, r.botClicks]));

  // Distinct bot reasons (with counts) per prospect, so the "(N filtered)"
  // tooltips can explain WHY activity was excluded.
  const botOpenReasonRows = await db
    .select({
      prospectId: emailOpenEventsTable.prospectId,
      reason: sql<string>`coalesce(${emailOpenEventsTable.botReason}, 'unspecified')`,
      n: sql<number>`count(*)::int`,
    })
    .from(emailOpenEventsTable)
    .where(and(eq(emailOpenEventsTable.clientId, clientId), eq(emailOpenEventsTable.isBot, true)))
    .groupBy(emailOpenEventsTable.prospectId, sql`coalesce(${emailOpenEventsTable.botReason}, 'unspecified')`);
  const botClickReasonRows = await db
    .select({
      prospectId: linkClickEventsTable.prospectId,
      reason: sql<string>`coalesce(${linkClickEventsTable.botReason}, 'unspecified')`,
      n: sql<number>`count(*)::int`,
    })
    .from(linkClickEventsTable)
    .where(and(eq(linkClickEventsTable.clientId, clientId), eq(linkClickEventsTable.isBot, true)))
    .groupBy(linkClickEventsTable.prospectId, sql`coalesce(${linkClickEventsTable.botReason}, 'unspecified')`);
  const collectReasons = (rows: { prospectId: number; reason: string; n: number }[]) => {
    const map = new Map<number, { reason: string; count: number }[]>();
    for (const r of rows) {
      const list = map.get(r.prospectId) ?? [];
      list.push({ reason: r.reason, count: r.n });
      map.set(r.prospectId, list);
    }
    // Most frequent reasons first.
    for (const list of map.values()) list.sort((a, b) => b.count - a.count);
    return map;
  };
  const botOpenReasonsByProspect = collectReasons(botOpenReasonRows);
  const botClickReasonsByProspect = collectReasons(botClickReasonRows);

  const autoRuns = await db
    .select({
      prospectId: automationRunsTable.prospectId,
      sent: sql<number>`count(*) filter (where ${automationRunsTable.status} = 'sent')::int`,
      pending: sql<number>`count(*) filter (where ${automationRunsTable.status} in ('pending','sending'))::int`,
    })
    .from(automationRunsTable)
    .where(and(
      eq(automationRunsTable.clientId, clientId),
      inArray(automationRunsTable.automationType, ["meeting_request", CALENDLY_CLICK_FOLLOW_UP_TYPE]),
    ))
    .groupBy(automationRunsTable.prospectId);
  const autoByProspect = new Map(autoRuns.map(r => [r.prospectId, r]));

  const appts = await db
    .select({ prospectId: appointmentsTable.prospectId, n: sql<number>`count(*)::int` })
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.clientId, clientId), sql`${appointmentsTable.status} != 'cancelled'`))
    .groupBy(appointmentsTable.prospectId);
  const apptByProspect = new Map(appts.map(r => [r.prospectId, r.n]));

  const campaigns = await db
    .select({ id: campaignsTable.id, name: campaignsTable.name })
    .from(campaignsTable)
    .where(eq(campaignsTable.clientId, clientId));
  const campaignName = new Map(campaigns.map(c => [c.id, c.name]));

  let rows = prospects.map(p => {
    const e = emailByProspect.get(p.id);
    const l = linkByProspect.get(p.id);
    const a = autoByProspect.get(p.id);
    const meetingScheduled = (apptByProspect.get(p.id) ?? 0) > 0;
    const effectiveLevel = (p.manualInterestLevel ?? p.interestLevel ?? "low") as "low" | "medium" | "hot";
    const attachmentViewed = (l?.attachmentViews ?? 0) > 0;
    const input = {
      emailsSent: e?.emailsSent ?? 0,
      emailsDelivered: e?.emailsDelivered ?? 0,
      emailsBounced: e?.emailsBounced ?? 0,
      validOpens: e?.validOpens ?? 0,
      attachmentViewed,
      linksClicked: l?.linksClicked ?? 0,
      calendlyClicked: (l?.calendlyClicks ?? 0) > 0,
      meetingRequestSent: (a?.sent ?? 0) > 0,
      meetingScheduled,
      interestLevel: effectiveLevel,
    };
    const next = recommendedNextAction(input);
    const cids = e?.campaignIds ?? [];
    return {
      prospectId: p.id,
      companyName: p.companyName,
      contactName: p.contactName,
      email: p.email,
      campaignIds: cids,
      campaigns: cids.map(id => campaignName.get(id)).filter(Boolean).join(", "),
      emailsSent: input.emailsSent,
      emailsDelivered: input.emailsDelivered,
      emailsBounced: input.emailsBounced,
      totalOpens: e?.totalOpens ?? 0,
      validOpens: input.validOpens,
      lastOpenedAt: e?.lastOpenedAt ? new Date(e.lastOpenedAt).toISOString() : null,
      attachmentViewed,
      attachmentDownloads: l?.attachmentDownloads ?? 0,
      linksClicked: input.linksClicked,
      botOpensFiltered: botOpensByProspect.get(p.id) ?? 0,
      botClicksFiltered: botClicksByProspect.get(p.id) ?? 0,
      botOpenReasons: botOpenReasonsByProspect.get(p.id) ?? [],
      botClickReasons: botClickReasonsByProspect.get(p.id) ?? [],
      calendlyClicked: input.calendlyClicked,
      interestScore: p.engagementScore,
      interestLevel: effectiveLevel,
      manualOverride: !!p.manualInterestLevel,
      meetingRequestSent: input.meetingRequestSent,
      meetingRequestPending: (a?.pending ?? 0) > 0,
      meetingScheduled,
      nextAction: next.action,
      nextActionReason: next.reason,
    };
  });

  // Filters
  if (q.interest && ["low", "medium", "hot"].includes(q.interest)) {
    rows = rows.filter(r => r.interestLevel === q.interest);
  }
  if (q.campaignId) {
    const cid = parseInt(q.campaignId, 10);
    if (!isNaN(cid)) rows = rows.filter(r => r.campaignIds.includes(cid));
  }
  if (q.attachment === "viewed") rows = rows.filter(r => r.attachmentViewed);
  if (q.attachment === "not_viewed") rows = rows.filter(r => !r.attachmentViewed);
  if (q.meetingRequest === "sent") rows = rows.filter(r => r.meetingRequestSent);
  if (q.meetingRequest === "not_sent") rows = rows.filter(r => !r.meetingRequestSent);
  if (q.search) {
    rows = rows.filter(r => matchesEngagementSearch(
      [r.companyName, r.contactName, r.email],
      q.search ?? "",
    ));
  }

  // Sort
  const sortKey = ["totalOpens", "validOpens", "interestScore", "lastOpenedAt", "companyName"].includes(q.sort ?? "")
    ? (q.sort as "totalOpens" | "validOpens" | "interestScore" | "lastOpenedAt" | "companyName")
    : "interestScore";
  const dir = q.dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const av = a[sortKey]; const bv = b[sortKey];
    if (sortKey === "companyName") return dir * String(av).localeCompare(String(bv));
    if (sortKey === "lastOpenedAt") {
      return dir * ((av ? Date.parse(av as string) : 0) - (bv ? Date.parse(bv as string) : 0));
    }
    return dir * ((av as number) - (bv as number));
  });

  if (q.format === "csv") {
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "Company", "Contact", "Email", "Campaigns", "Emails Sent", "Emails Delivered", "Total Opens", "Valid Opens",
      "Last Opened", "Attachment Viewed", "Links Clicked", "Bot Opens Filtered", "Bot Clicks Filtered", "Interest Score", "Interest Level", "Manual Override",
      "Meeting Request Sent", "Calendly Link Clicked", "Meeting Scheduled", "Recommended Next Action",
    ];
    const lines = [header.join(",")].concat(rows.map(r => [
      r.companyName, r.contactName, r.email, r.campaigns, r.emailsSent, r.emailsDelivered, r.totalOpens, r.validOpens,
      r.lastOpenedAt ?? "", r.attachmentViewed ? "Yes" : "No", r.linksClicked, r.botOpensFiltered, r.botClicksFiltered, r.interestScore,
      r.interestLevel, r.manualOverride ? "Yes" : "No", r.meetingRequestSent ? "Yes" : "No",
      r.calendlyClicked ? "Yes" : "No", r.meetingScheduled ? "Yes" : "No", r.nextAction,
    ].map(esc).join(",")));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="prospect-engagement-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(lines.join("\n"));
  }

  const total = rows.length;
  const pageSize = Math.min(Math.max(parseInt(q.pageSize ?? "25", 10) || 25, 1), 200);
  const page = Math.max(parseInt(q.page ?? "1", 10) || 1, 1);
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  return res.json({
    total,
    page,
    pageSize,
    campaigns: campaigns.map(c => ({ id: c.id, name: c.name })),
    rows: paged.map(({ campaignIds, ...rest }) => rest),
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

  return res.json({
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
      inferredFromClick: e.inferredFromClick,
    })),
    clickEvents: clickEvents.map(e => ({
      id: e.id,
      emailId: e.emailId,
      linkId: e.linkId,
      eventType: e.eventType,
      clickedAt: e.clickedAt.toISOString(),
      isBot: e.isBot,
      botReason: e.botReason,
    })),
  });
});

// ─── Prospect timeline ───────────────────────────────────────────────────────
// Chronological merge of every engagement event for one prospect, plus the
// effective interest level and the recommended next action.
router.get("/prospects/:id/timeline", async (req, res) => {
  const prospectId = parseInt(req.params.id, 10);
  if (isNaN(prospectId)) return res.status(400).json({ error: "Invalid prospect id" });
  const clientId = req.clientId;

  const [prospect] = await db.select().from(prospectsTable)
    .where(and(eq(prospectsTable.id, prospectId), eq(prospectsTable.clientId, clientId)));
  if (!prospect) return res.status(404).json({ error: "Prospect not found" });

  const emails = await db.select().from(emailsTable)
    .where(and(eq(emailsTable.clientId, clientId), eq(emailsTable.prospectId, prospectId)));
  const links = await db.select().from(emailLinksTable)
    .where(and(eq(emailLinksTable.clientId, clientId), eq(emailLinksTable.prospectId, prospectId)));
  const linkById = new Map(links.map(l => [l.id, l]));
  const emailById = new Map(emails.map(e => [e.id, e]));
  const openEvents = await db.select().from(emailOpenEventsTable)
    .where(and(eq(emailOpenEventsTable.clientId, clientId), eq(emailOpenEventsTable.prospectId, prospectId)))
    .orderBy(desc(emailOpenEventsTable.openedAt)).limit(500);
  const clickEvents = await db.select().from(linkClickEventsTable)
    .where(and(eq(linkClickEventsTable.clientId, clientId), eq(linkClickEventsTable.prospectId, prospectId)))
    .orderBy(desc(linkClickEventsTable.clickedAt)).limit(500);
  const scoreEvents = await db.select().from(scoreEventsTable)
    .where(and(eq(scoreEventsTable.clientId, clientId), eq(scoreEventsTable.prospectId, prospectId)))
    .orderBy(scoreEventsTable.id).limit(1000);
  const runs = await db.select().from(automationRunsTable)
    .where(and(eq(automationRunsTable.clientId, clientId), eq(automationRunsTable.prospectId, prospectId)));
  const appts = await db.select().from(appointmentsTable)
    .where(and(eq(appointmentsTable.clientId, clientId), eq(appointmentsTable.prospectId, prospectId)));

  type Item = { ts: string; type: string; title: string; detail: string | null; source: string };
  const items: Item[] = [];
  const subj = (emailId: number | null) => emailId != null ? emailById.get(emailId)?.subject ?? null : null;

  for (const e of emails) {
    items.push({ ts: e.sentAt.toISOString(), type: "email_sent", title: `Email sent: ${e.subject}`, detail: null, source: "Outreach" });
    if (e.deliveredAt) items.push({ ts: e.deliveredAt.toISOString(), type: "email_delivered", title: `Email delivered: ${e.subject}`, detail: "Confirmed by the email provider", source: "Delivery webhook" });
    if (e.bouncedAt) items.push({ ts: e.bouncedAt.toISOString(), type: "email_bounced", title: `Email bounced: ${e.subject}`, detail: "The address rejected the message", source: "Delivery webhook" });
    if (e.repliedAt) items.push({ ts: e.repliedAt.toISOString(), type: "reply", title: `Reply received: ${e.subject}`, detail: null, source: "Inbound email" });
  }
  for (const o of openEvents) {
    items.push({
      ts: o.openedAt.toISOString(),
      type: o.isValid ? "open" : "open_filtered",
      title: !o.isValid ? "Open filtered out"
        : o.inferredFromClick ? "Email opened (confirmed by link click)"
        : "Email opened (estimated)",
      detail: o.isValid
        ? subj(o.emailId)
        : `${o.botReason ?? "bot/scanner or duplicate"}${subj(o.emailId) ? ` — ${subj(o.emailId)}` : ""}`,
      source: o.isValid && o.inferredFromClick ? "Inferred from click tracking" : "Open tracking (estimate)",
    });
  }
  for (const c of clickEvents) {
    const link = c.linkId != null ? linkById.get(c.linkId) : undefined;
    const kind = link?.kind;
    const label = c.eventType === "download" ? "Attachment downloaded"
      : kind === "cta" ? "Calendly link clicked"
      : kind === "attachment" ? "Attachment viewed"
      : "Link clicked";
    items.push({
      ts: c.clickedAt.toISOString(),
      type: c.isBot ? "click_filtered"
        : c.eventType === "download" ? "attachment_download" : kind === "cta" ? "calendly_click" : kind === "attachment" ? "attachment_view" : "link_click",
      title: c.isBot ? `${label} (filtered as bot)` : label,
      detail: c.isBot
        ? [c.botReason ?? "bot/scanner", link?.name].filter(Boolean).join(" — ")
        : link?.name ?? null,
      source: "Click tracking",
    });
  }
  // Interest changes + non-duplicated score events (manual overrides,
  // questionnaire, positive reply). Opens/clicks are already covered above.
  let prevLevel = "low";
  for (const s of scoreEvents) {
    if (s.eventType === "manual_override") {
      items.push({ ts: s.createdAt.toISOString(), type: "interest_change", title: "Interest level manually changed", detail: s.reason, source: "Manual override" });
    } else if (["questionnaire_opened", "questionnaire_submitted", "positive_reply"].includes(s.eventType)) {
      items.push({ ts: s.createdAt.toISOString(), type: s.eventType, title: s.reason, detail: `+${s.points} pts → score ${s.scoreAfter}`, source: "Engagement scoring" });
    } else if (s.interestLevelAfter !== prevLevel) {
      items.push({
        ts: s.createdAt.toISOString(),
        type: "interest_change",
        title: `Interest level changed to ${s.interestLevelAfter.toUpperCase()}`,
        detail: `${s.reason} (score ${s.scoreAfter})`,
        source: "Engagement scoring",
      });
    }
    if (s.eventType !== "manual_override") prevLevel = s.interestLevelAfter;
  }
  for (const r of runs) {
    const clickFollowUp = r.automationType === CALENDLY_CLICK_FOLLOW_UP_TYPE;
    const titlePrefix = clickFollowUp ? "Scheduling follow-up" : "Automated meeting request";
    const typePrefix = clickFollowUp ? "scheduling_follow_up" : "meeting_request";
    if (r.sentAt) {
      items.push({ ts: r.sentAt.toISOString(), type: `${typePrefix}_sent`, title: `${titlePrefix} sent`, detail: r.triggerReason, source: "Automation" });
    } else if (r.status === "pending" || r.status === "sending") {
      items.push({ ts: r.createdAt.toISOString(), type: `${typePrefix}_queued`, title: `${titlePrefix} queued`, detail: `${r.triggerReason} — scheduled for ${r.scheduledFor.toISOString()}`, source: "Automation" });
    } else if (r.status === "suppressed") {
      items.push({ ts: r.createdAt.toISOString(), type: `${typePrefix}_suppressed`, title: `${titlePrefix} suppressed`, detail: r.resultDetail, source: "Automation" });
    }
  }
  for (const a of appts) {
    items.push({
      ts: a.createdAt.toISOString(),
      type: "meeting_scheduled",
      title: `Meeting scheduled: ${a.type.replace(/_/g, " ")}`,
      detail: `For ${a.scheduledAt.toISOString()}${a.location ? ` at ${a.location}` : ""} (${a.status})`,
      source: "Appointments",
    });
  }

  items.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));

  const [linkAgg] = await db
    .select({
      linksClicked: sql<number>`coalesce(sum(${emailLinksTable.clickCount}) filter (where ${emailLinksTable.kind} != 'attachment'), 0)::int`,
      attachmentViews: sql<number>`coalesce(sum(${emailLinksTable.clickCount}) filter (where ${emailLinksTable.kind} = 'attachment'), 0)::int`,
      calendlyClicks: sql<number>`coalesce(sum(${emailLinksTable.clickCount}) filter (where ${emailLinksTable.kind} = 'cta'), 0)::int`,
    })
    .from(emailLinksTable)
    .where(and(eq(emailLinksTable.clientId, clientId), eq(emailLinksTable.prospectId, prospectId)));

  const effectiveLevel = (prospect.manualInterestLevel ?? prospect.interestLevel ?? "low") as "low" | "medium" | "hot";
  const next = recommendedNextAction({
    emailsSent: emails.length,
    emailsDelivered: emails.filter(e => e.deliveredAt).length,
    emailsBounced: emails.filter(e => e.bouncedAt).length,
    validOpens: emails.reduce((n, e) => n + e.validOpens, 0),
    attachmentViewed: (linkAgg?.attachmentViews ?? 0) > 0,
    linksClicked: linkAgg?.linksClicked ?? 0,
    calendlyClicked: (linkAgg?.calendlyClicks ?? 0) > 0,
    meetingRequestSent: runs.some(r => r.status === "sent"),
    meetingScheduled: appts.some(a => a.status !== "cancelled"),
    interestLevel: effectiveLevel,
  });

  return res.json({
    interestLevel: effectiveLevel,
    systemInterestLevel: prospect.interestLevel,
    manualInterestLevel: prospect.manualInterestLevel,
    engagementScore: prospect.engagementScore,
    nextAction: next.action,
    nextActionReason: next.reason,
    items,
  });
});

export default router;
