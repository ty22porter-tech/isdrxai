import {
  db,
  prospectsTable,
  usersTable,
  scoreEventsTable,
  automationRunsTable,
  notificationsTable,
  emailsTable,
  type User,
} from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { sendEmail } from "./emailSender";
import { getPublicAppUrl } from "./publicUrl";
import { logger } from "./logger";
import { enqueueHotProspect } from "./callerQueue";

/** Default point model per spec — every value is user-configurable. */
export const DEFAULT_ENGAGEMENT_SETTINGS = {
  openTrackingEnabled: true,
  attachmentTrackingEnabled: true,
  autoFollowUpEnabled: true,
  points: {
    open1: 1,
    open2: 2,
    open3: 3,
    openMore: 1,
    linkClick: 4,
    attachmentView: 5,
    attachmentViewRepeat: 3,
    calendlyClick: 8,
    questionnaireOpened: 6,
    questionnaireSubmitted: 12,
    positiveReply: 15,
    meetingScheduled: 20,
  },
  /** Interest levels: Low 0–(mediumMin-1), Medium mediumMin–(hotMin-1), Hot hotMin+. */
  mediumMin: 5,
  hotMin: 12,
  /** Open dedup window in minutes (mirrors tracking dedup). */
  dedupWindowMinutes: 10,
  /** Delay before the repeated-open meeting-request email goes out. */
  followUpDelayMinutes: 30,
  /** Max automated meeting-request emails per client per calendar day. */
  dailySendCap: 25,
  template: {
    subject: "Quick conversation, {{companyName}}?",
    body:
      "Hi {{contactName}},\n\n" +
      "Thanks for taking a look at the information I sent about {{companyName}}.\n\n" +
      "Rather than trade more emails, would you be open to a quick call? Would a morning or afternoon next week be easier? You can choose a time using the link below, or simply reply with a preferred time and we'll coordinate it.\n\n" +
      "Looking forward to it.",
  },
};

export type EngagementSettings = typeof DEFAULT_ENGAGEMENT_SETTINGS;

/** Merge a user's stored partial settings over the defaults (deep for nested objects). */
export function getEngagementSettings(user: Pick<User, "engagementSettings"> | null | undefined): EngagementSettings {
  const stored = (user?.engagementSettings ?? {}) as Partial<EngagementSettings>;
  return {
    ...DEFAULT_ENGAGEMENT_SETTINGS,
    ...stored,
    points: { ...DEFAULT_ENGAGEMENT_SETTINGS.points, ...(stored.points ?? {}) },
    template: { ...DEFAULT_ENGAGEMENT_SETTINGS.template, ...(stored.template ?? {}) },
  };
}

export function interestLevelForScore(score: number, s: EngagementSettings): "low" | "medium" | "hot" {
  if (score >= s.hotMin) return "hot";
  if (score >= s.mediumMin) return "medium";
  return "low";
}

export type EngagementEventType =
  | "open"
  | "link_click"
  | "attachment_view"
  | "calendly_click"
  | "questionnaire_opened"
  | "questionnaire_submitted"
  | "positive_reply"
  | "meeting_scheduled";

const VALID_CALENDLY_RE = /^https:\/\/(www\.)?calendly\.com\/.+/i;
export function isValidCalendlyUrl(url: string | null | undefined): boolean {
  return !!url && VALID_CALENDLY_RE.test(url.trim());
}

interface EventContext {
  emailId?: number;
  campaignId?: number | null;
  /** Extra detail appended to the history reason. */
  detail?: string;
}

/**
 * Record an engagement event for a prospect: award points per the client's
 * point model, append a score-history row, update the prospect's system score
 * and interest level, fire the Hot alert on a Low/Medium → Hot transition,
 * and (on the 3rd valid open) enqueue the meeting-request automation run.
 *
 * Never throws — engagement scoring must not break the tracking/webhook paths
 * that call it.
 */
export async function recordEngagementEvent(
  prospectId: number,
  eventType: EngagementEventType,
  ctx: EventContext = {},
): Promise<void> {
  try {
    const [prospect] = await db.select().from(prospectsTable).where(eq(prospectsTable.id, prospectId));
    if (!prospect) return;
    const [client] = await db.select().from(usersTable).where(eq(usersTable.id, prospect.clientId));
    if (!client) return;
    const settings = getEngagementSettings(client);
    const p = settings.points;

    if (eventType === "open" && !settings.openTrackingEnabled) return;
    if (eventType === "attachment_view" && !settings.attachmentTrackingEnabled) return;

    // Everything score-related runs inside ONE transaction serialized per
    // prospect via a pg advisory lock: prior-event counts, event insert, and
    // the cached score/level update. This makes concurrent events (e.g. an
    // open and a click landing together) race-safe — no lost points, exact
    // nth-open detection, and exactly-once Hot transitions.
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(481516, ${prospectId})`);

      const prior = await tx
        .select({ eventType: scoreEventsTable.eventType, n: sql<number>`count(*)::int` })
        .from(scoreEventsTable)
        .where(and(
          eq(scoreEventsTable.prospectId, prospectId),
          inArray(scoreEventsTable.eventType, ["open", "attachment_view", "questionnaire_opened", "questionnaire_submitted", "positive_reply", "meeting_scheduled", "calendly_click"]),
        ))
        .groupBy(scoreEventsTable.eventType);
      const count = (t: string) => prior.find(r => r.eventType === t)?.n ?? 0;

      let points = 0;
      let reason = "";
      switch (eventType) {
        case "open": {
          const nth = count("open") + 1;
          points = nth === 1 ? p.open1 : nth === 2 ? p.open2 : nth === 3 ? p.open3 : p.openMore;
          reason = `Valid email open #${nth}`;
          break;
        }
        case "link_click":
          points = p.linkClick;
          reason = "Link clicked";
          break;
        case "attachment_view": {
          const repeat = count("attachment_view") > 0;
          points = repeat ? p.attachmentViewRepeat : p.attachmentView;
          reason = repeat ? "Attachment viewed again" : "Attachment viewed";
          break;
        }
        case "calendly_click":
          points = p.calendlyClick;
          reason = "Scheduling link clicked";
          break;
        case "questionnaire_opened":
          if (count("questionnaire_opened") > 0) return null; // once per prospect
          points = p.questionnaireOpened;
          reason = "Scheduling questionnaire opened";
          break;
        case "questionnaire_submitted":
          if (count("questionnaire_submitted") > 0) return null;
          points = p.questionnaireSubmitted;
          reason = "Scheduling questionnaire submitted";
          break;
        case "positive_reply":
          if (count("positive_reply") > 0) return null;
          points = p.positiveReply;
          reason = "Positive reply received";
          break;
        case "meeting_scheduled":
          if (count("meeting_scheduled") > 0) return null;
          points = p.meetingScheduled;
          reason = "Meeting scheduled";
          break;
      }
      if (ctx.detail) reason += ` — ${ctx.detail}`;

      await tx.insert(scoreEventsTable).values({
        clientId: prospect.clientId,
        prospectId,
        emailId: ctx.emailId ?? null,
        eventType,
        points,
        reason,
        scoreAfter: 0, // patched below from the authoritative sum
        interestLevelAfter: "low",
      });

      // Authoritative score = sum over all events (event log is the source of
      // truth; the prospect columns are just a cache).
      const [{ total }] = await tx
        .select({ total: sql<number>`coalesce(sum(${scoreEventsTable.points}), 0)::int` })
        .from(scoreEventsTable)
        .where(eq(scoreEventsTable.prospectId, prospectId));

      const newScore = total;
      const prevScore = newScore - points;
      const prevLevel = interestLevelForScore(prevScore, settings);
      const newLevel = interestLevelForScore(newScore, settings);

      await tx.execute(sql`
        update score_events set score_after = ${newScore}, interest_level_after = ${newLevel}
        where id = (select max(id) from score_events where prospect_id = ${prospectId})
      `);
      await tx.update(prospectsTable)
        .set({ engagementScore: newScore, interestLevel: newLevel })
        .where(eq(prospectsTable.id, prospectId));

      // 3rd valid open → enqueue ONE meeting-request follow-up per prospect per
      // campaign, delayed. The unique index is the idempotency key: a concurrent
      // duplicate insert is silently dropped by onConflictDoNothing.
      if (eventType === "open" && count("open") + 1 === 3 && settings.autoFollowUpEnabled) {
        await tx.insert(automationRunsTable).values({
          clientId: prospect.clientId,
          prospectId,
          campaignKey: ctx.campaignId ?? 0,
          automationType: "meeting_request",
          status: "pending",
          triggerReason: "3rd estimated valid open",
          validOpensAtTrigger: 3,
          scheduledFor: new Date(Date.now() + settings.followUpDelayMinutes * 60 * 1000),
        }).onConflictDoNothing();
      }

      return { newScore, becameHot: newLevel === "hot" && prevLevel !== "hot" };
    });

    // Hot alert: fires once on the transition into Hot (system level; a manual
    // override does not re-trigger it). Detected under the lock, sent after
    // commit so a slow email provider never holds the transaction open.
    if (outcome?.becameHot) {
      await sendHotAlert(client, prospect, outcome.newScore);
      await enqueueHotProspect(prospect.clientId, prospect.id);
    }
  } catch (err) {
    logger.error({ err, prospectId, eventType }, "Engagement scoring failed");
  }
}

/** Terminal events (negative reply / unsubscribe / bounce): cancel any pending
 *  automation runs so a suppressed prospect never gets the follow-up. */
export async function cancelPendingAutomation(prospectId: number, why: string): Promise<void> {
  try {
    await db.update(automationRunsTable)
      .set({ status: "suppressed", resultDetail: why })
      .where(and(eq(automationRunsTable.prospectId, prospectId), eq(automationRunsTable.status, "pending")));
  } catch (err) {
    logger.error({ err, prospectId }, "Failed to cancel pending automation");
  }
}

async function sendHotAlert(
  client: User,
  prospect: { id: number; clientId: string; companyName: string; contactName: string; email: string; city: string; state: string; industry: string; linkedinOutreach: boolean },
  score: number,
): Promise<void> {
  let notif: { id: number } | undefined;
  try {
    [notif] = await db.insert(notificationsTable).values({
      clientId: prospect.clientId,
      type: "hot_prospect",
      title: `${prospect.companyName} is now a Hot prospect`,
      body: `${prospect.contactName} at ${prospect.companyName} reached an engagement score of ${score}. Consider reaching out personally.`,
      prospectId: prospect.id,
    }).returning();
  } catch (err) {
    // Never let a failed in-app notification block the alert email.
    logger.error({ err, prospectId: prospect.id }, "Hot-alert in-app notification failed (email will still be sent)");
  }

  const alertTo = client.outreachEmail?.trim() || client.email?.trim();
  if (!alertTo) return;
  const appUrl = getPublicAppUrl();
  // Latest email subject gives useful context in the alert.
  const [lastEmail] = await db.select({ subject: emailsTable.subject })
    .from(emailsTable)
    .where(eq(emailsTable.prospectId, prospect.id))
    .orderBy(sql`${emailsTable.sentAt} desc`)
    .limit(1);
  const prospectUrl = `${appUrl}/app/prospects?prospect=${prospect.id}`;
  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  try {
    await sendEmail({
      fromName: "iSDRX AI Alerts",
      to: alertTo,
      replyTo: alertTo,
      subject: `🔥 Hot prospect: ${prospect.companyName}`,
      body:
        `${prospect.contactName} at ${prospect.companyName} just became a HOT prospect (engagement score ${score}).\n\n` +
        `Company: ${prospect.companyName}\n` +
        `Contact: ${prospect.contactName} <${prospect.email}>\n` +
        `Location: ${[prospect.city, prospect.state].filter(Boolean).join(", ")}\n` +
        `Industry: ${prospect.industry}\n` +
        (lastEmail ? `Last email: ${lastEmail.subject}\n` : "") +
        `Marked for LinkedIn outreach: ${prospect.linkedinOutreach ? "yes" : "no"}\n\n` +
        `Click here to review: ${prospectUrl}\n\n` +
        `Tip: hot prospects are opening your emails repeatedly — a personal touch (call or LinkedIn) works best right now.`,
      html:
        `<p>${escapeHtml(prospect.contactName ?? "")} at ${escapeHtml(prospect.companyName ?? "")} just became a <strong>HOT</strong> prospect (engagement score ${score}).</p>` +
        `<p>Company: ${escapeHtml(prospect.companyName ?? "")}<br>` +
        `Contact: ${escapeHtml(prospect.contactName ?? "")} &lt;${escapeHtml(prospect.email ?? "")}&gt;<br>` +
        `Location: ${escapeHtml([prospect.city, prospect.state].filter(Boolean).join(", "))}<br>` +
        `Industry: ${escapeHtml(prospect.industry ?? "")}<br>` +
        (lastEmail ? `Last email: ${escapeHtml(lastEmail.subject ?? "")}<br>` : "") +
        `Marked for LinkedIn outreach: ${prospect.linkedinOutreach ? "yes" : "no"}</p>` +
        `<p><a href="${prospectUrl}">Click here to review</a></p>` +
        `<p>Tip: hot prospects are opening your emails repeatedly — a personal touch (call or LinkedIn) works best right now.</p>`,
    });
  } catch (err) {
    logger.error(
      { err, prospectId: prospect.id, notificationId: notif?.id },
      notif
        ? "Hot-alert email failed (in-app notification was saved)"
        : "Hot-alert email failed AND in-app notification failed — no alert channel succeeded",
    );
  }
}
