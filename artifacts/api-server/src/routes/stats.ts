import { Router } from "express";
import { db } from "@workspace/db";
import { prospectsTable, emailsTable, callsTable, appointmentsTable, activityTable, campaignsTable } from "@workspace/db";
import { eq, gte, count, sql, and, lt, isNotNull, desc } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import { GetActivityFeedQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../lib/requireAuth";

const router = Router();
router.use(requireAuth);

router.get("/dashboard", async (req, res) => {
  const cid = req.clientId;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalProspects] = await db.select({ count: count() }).from(prospectsTable).where(eq(prospectsTable.clientId, cid));
  const [activeProspects] = await db.select({ count: count() }).from(prospectsTable).where(
    and(eq(prospectsTable.clientId, cid), sql`${prospectsTable.status} NOT IN ('closed_won', 'closed_lost', 'new')`)
  );
  const [emailsSent] = await db.select({ count: count() }).from(emailsTable).where(eq(emailsTable.clientId, cid));
  const [callsMade] = await db.select({ count: count() }).from(callsTable).where(eq(callsTable.clientId, cid));
  const [appointmentsSet] = await db.select({ count: count() }).from(appointmentsTable).where(and(eq(appointmentsTable.clientId, cid), sql`${appointmentsTable.status} != 'cancelled'`));
  const [appointmentsCompleted] = await db.select({ count: count() }).from(appointmentsTable).where(and(eq(appointmentsTable.clientId, cid), eq(appointmentsTable.status, "completed")));
  const [thisWeek] = await db.select({ count: count() }).from(activityTable).where(and(eq(activityTable.clientId, cid), gte(activityTable.createdAt, weekAgo)));

  const statusCounts = await db
    .select({ status: prospectsTable.status, count: count() })
    .from(prospectsTable)
    .where(eq(prospectsTable.clientId, cid))
    .groupBy(prospectsTable.status);

  const total = totalProspects.count;
  const won = statusCounts.find(s => s.status === "closed_won")?.count ?? 0;
  const conversionRate = total > 0 ? Math.round((won / total) * 100) : 0;

  res.json({
    totalProspects: total,
    activeProspects: activeProspects.count,
    emailsSent: emailsSent.count,
    callsMade: callsMade.count,
    appointmentsSet: appointmentsSet.count,
    appointmentsCompleted: appointmentsCompleted.count,
    conversionRate,
    thisWeekActivity: thisWeek.count,
    prospectsByStatus: statusCounts.map(s => ({ status: s.status, count: s.count })),
  });
});

function leadershipPeriod(rawDays: unknown) {
  if (rawDays !== undefined && (typeof rawDays !== "string" || !/^\d+$/.test(rawDays))) {
    return null;
  }
  const days = rawDays === undefined ? 30 : Number(rawDays);
  if (!Number.isInteger(days) || days < 7 || days > 365) return null;

  const end = new Date();
  const start = new Date(end);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { days, start, end };
}

function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((numerator / denominator) * 10_000) / 100));
}

function dateKey(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

router.get("/leadership", async (req, res) => {
  const period = leadershipPeriod(req.query.days);
  if (!period) {
    return res.status(400).json({ error: "days must be a single integer from 7 to 365" });
  }

  const cid = req.clientId;
  const inPeriod = (column: AnyColumn) =>
    and(gte(column, period.start), lt(column, period.end));

  const [
    prospectTotals,
    emailTotals,
    callTotals,
    appointmentTotals,
    emailDaily,
    callDaily,
    appointmentDaily,
    pipeline,
    campaigns,
    callOutcomes,
  ] = await Promise.all([
    db.select({
      count: count(),
      hot: sql<number>`count(*) filter (where coalesce(${prospectsTable.manualInterestLevel}, ${prospectsTable.interestLevel}) = 'hot')::int`,
    }).from(prospectsTable).where(and(eq(prospectsTable.clientId, cid), inPeriod(prospectsTable.createdAt))),
    db.select({
      count: count(),
      opened: sql<number>`count(*) filter (where ${emailsTable.openedAt} is not null)::int`,
    }).from(emailsTable).where(and(eq(emailsTable.clientId, cid), inPeriod(emailsTable.sentAt))),
    db.select({
      count: count(),
      completed: sql<number>`count(*) filter (where ${callsTable.status} = 'completed')::int`,
      connected: sql<number>`count(*) filter (
        where ${callsTable.status} = 'completed'
          and ${callsTable.outcome} in (
            'connected',
            'callback_requested',
            'information_sent',
            'meeting_booked',
            'not_interested',
            'do_not_call'
          )
      )::int`,
    }).from(callsTable).where(and(eq(callsTable.clientId, cid), inPeriod(callsTable.createdAt))),
    db.select({ count: count() }).from(appointmentsTable).where(and(
      eq(appointmentsTable.clientId, cid),
      sql`${appointmentsTable.status} != 'cancelled'`,
      inPeriod(appointmentsTable.createdAt),
    )),
    db.select({
      date: sql<string>`to_char(${emailsTable.sentAt}, 'YYYY-MM-DD')`,
      count: count(),
    }).from(emailsTable).where(and(eq(emailsTable.clientId, cid), inPeriod(emailsTable.sentAt)))
      .groupBy(sql`to_char(${emailsTable.sentAt}, 'YYYY-MM-DD')`),
    db.select({
      date: sql<string>`to_char(${callsTable.createdAt}, 'YYYY-MM-DD')`,
      count: count(),
    }).from(callsTable).where(and(eq(callsTable.clientId, cid), inPeriod(callsTable.createdAt)))
      .groupBy(sql`to_char(${callsTable.createdAt}, 'YYYY-MM-DD')`),
    db.select({
      date: sql<string>`to_char(${appointmentsTable.createdAt}, 'YYYY-MM-DD')`,
      count: count(),
    }).from(appointmentsTable).where(and(
      eq(appointmentsTable.clientId, cid),
      sql`${appointmentsTable.status} != 'cancelled'`,
      inPeriod(appointmentsTable.createdAt),
    )).groupBy(sql`to_char(${appointmentsTable.createdAt}, 'YYYY-MM-DD')`),
    db.select({ status: prospectsTable.status, count: count() }).from(prospectsTable)
      .where(eq(prospectsTable.clientId, cid))
      .groupBy(prospectsTable.status),
    db.select().from(campaignsTable)
      .where(eq(campaignsTable.clientId, cid))
      .orderBy(desc(campaignsTable.appointmentsSet), desc(campaignsTable.emailsSent), desc(campaignsTable.callsMade))
      .limit(8),
    db.select({
      outcome: callsTable.outcome,
      count: count(),
    }).from(callsTable).where(and(
      eq(callsTable.clientId, cid),
      eq(callsTable.status, "completed"),
      isNotNull(callsTable.outcome),
      inPeriod(callsTable.createdAt),
    )).groupBy(callsTable.outcome).orderBy(desc(count())),
  ]);

  const prospects = prospectTotals[0]?.count ?? 0;
  const emails = emailTotals[0]?.count ?? 0;
  const calls = callTotals[0]?.count ?? 0;
  const appointments = appointmentTotals[0]?.count ?? 0;
  const completedCalls = callTotals[0]?.completed ?? 0;
  const emailByDate = new Map(emailDaily.map((row) => [dateKey(row.date), row.count]));
  const callByDate = new Map(callDaily.map((row) => [dateKey(row.date), row.count]));
  const appointmentByDate = new Map(appointmentDaily.map((row) => [dateKey(row.date), row.count]));
  const dailyActivity = Array.from({ length: period.days }, (_, offset) => {
    const day = new Date(period.start);
    day.setUTCDate(day.getUTCDate() + offset);
    const date = day.toISOString().slice(0, 10);
    return {
      date,
      emails: emailByDate.get(date) ?? 0,
      calls: callByDate.get(date) ?? 0,
      appointments: appointmentByDate.get(date) ?? 0,
    };
  });

  return res.json({
    period: { days: period.days, start: period.start.toISOString(), end: period.end.toISOString() },
    totals: {
      prospects,
      emails,
      calls,
      appointments,
      hotProspects: prospectTotals[0]?.hot ?? 0,
      completedCalls,
    },
    rates: {
      emailOpenRate: percentage(emailTotals[0]?.opened ?? 0, emails),
      appointmentRate: percentage(appointments, prospects),
      callConnectRate: percentage(callTotals[0]?.connected ?? 0, completedCalls),
    },
    dailyActivity,
    pipeline: pipeline.map((row) => ({ status: row.status, count: row.count })),
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      prospectCount: campaign.prospectCount,
      emailsSent: campaign.emailsSent,
      callsMade: campaign.callsMade,
      appointmentsSet: campaign.appointmentsSet,
      appointmentRate: percentage(campaign.appointmentsSet, campaign.prospectCount),
    })),
    callOutcomes: callOutcomes.map((row) => ({ outcome: row.outcome!, count: row.count })),
  });
});

router.get("/activity", async (req, res) => {
  const query = GetActivityFeedQueryParams.parse(req.query);
  const limit = query.limit ?? 20;
  const items = await db.select().from(activityTable).where(eq(activityTable.clientId, req.clientId)).orderBy(sql`${activityTable.createdAt} desc`).limit(limit);
  res.json(items.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })));
});

export default router;
