import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { campaignsTable, db, usersTable, prospectsTable, emailsTable, callsTable, appointmentsTable, videoViewsTable } from "@workspace/db";
import { and, eq, count, desc, sql, gte, lt } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/requireAuth";
import { ConversionDetailQuery, getCalendarCounts, getConversionDetails } from "../lib/conversionDetails";

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);
router.get("/conversion-details", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const input = ConversionDetailQuery.safeParse(req.query);
  if (!input.success) return res.status(400).json({ error: "Invalid metric or pagination." });
  return res.json(await getConversionDetails(input.data));
});

async function fetchClerkIdentity(userId: string): Promise<{ name: string | null; email: string | null }> {
  try {
    const cu = await clerkClient.users.getUser(userId);
    const name = [cu.firstName, cu.lastName].filter(Boolean).join(" ") || null;
    const email =
      cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress ??
      cu.emailAddresses[0]?.emailAddress ??
      null;
    return { name, email };
  } catch {
    return { name: null, email: null };
  }
}

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

function dateKey(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

router.get("/leadership", async (req, res) => {
  const period = leadershipPeriod(req.query.days);
  if (!period) {
    return res.status(400).json({ error: "days must be a single integer from 7 to 365" });
  }

  const [clientSummary, emailDaily, callDaily, appointmentDaily, clientRows, planRows, verticalRows] = await Promise.all([
    db.execute(sql`
      SELECT
        count(*) FILTER (WHERE is_admin = false)::int AS clients,
        count(*) FILTER (WHERE is_admin = false AND status = 'active')::int AS active_clients,
        count(*) FILTER (WHERE is_admin = false AND status = 'suspended')::int AS suspended_clients,
        count(*) FILTER (WHERE is_admin = false AND status = 'trialing')::int AS trial_clients,
        count(*) FILTER (WHERE is_admin = false AND status = 'active')::int AS paid_clients,
        (SELECT count(*)::int FROM prospects WHERE created_at >= ${period.start} AND created_at < ${period.end}) AS prospects,
        (SELECT count(*)::int FROM emails WHERE sent_at >= ${period.start} AND sent_at < ${period.end}) AS emails,
        (SELECT count(*)::int FROM calls WHERE created_at >= ${period.start} AND created_at < ${period.end}) AS calls,
        (SELECT count(*)::int FROM appointments WHERE status != 'cancelled' AND created_at >= ${period.start} AND created_at < ${period.end}) AS appointments
      FROM users
    `),
    db.select({
      date: sql<string>`to_char(${emailsTable.sentAt}, 'YYYY-MM-DD')`,
      count: count(),
    }).from(emailsTable).where(and(gte(emailsTable.sentAt, period.start), lt(emailsTable.sentAt, period.end)))
      .groupBy(sql`to_char(${emailsTable.sentAt}, 'YYYY-MM-DD')`),
    db.select({
      date: sql<string>`to_char(${callsTable.createdAt}, 'YYYY-MM-DD')`,
      count: count(),
    }).from(callsTable).where(and(gte(callsTable.createdAt, period.start), lt(callsTable.createdAt, period.end)))
      .groupBy(sql`to_char(${callsTable.createdAt}, 'YYYY-MM-DD')`),
    db.select({
      date: sql<string>`to_char(${appointmentsTable.createdAt}, 'YYYY-MM-DD')`,
      count: count(),
    }).from(appointmentsTable).where(and(
      sql`${appointmentsTable.status} != 'cancelled'`,
      gte(appointmentsTable.createdAt, period.start),
      lt(appointmentsTable.createdAt, period.end),
    )).groupBy(sql`to_char(${appointmentsTable.createdAt}, 'YYYY-MM-DD')`),
    db.execute(sql`
      SELECT u.id, u.email, u.business_name, u.status, u.vertical,
        CASE
          WHEN u.status = 'active' THEN 'paid'
          WHEN u.status = 'trialing' THEN 'trial'
          ELSE 'none'
        END AS subscription_plan,
        coalesce(p.total, 0)::int AS prospects,
        coalesce(e.total, 0)::int AS emails,
        coalesce(c.total, 0)::int AS calls,
        coalesce(a.total, 0)::int AS appointments,
        greatest(p.last_at, e.last_at, c.last_at, a.last_at) AS last_activity
      FROM users u
      LEFT JOIN (
        SELECT client_id,
          count(*) FILTER (WHERE created_at >= ${period.start} AND created_at < ${period.end}) AS total,
          max(created_at) AS last_at
        FROM prospects GROUP BY client_id
      ) p ON p.client_id = u.id
      LEFT JOIN (
        SELECT client_id,
          count(*) FILTER (WHERE sent_at >= ${period.start} AND sent_at < ${period.end}) AS total,
          max(sent_at) AS last_at
        FROM emails GROUP BY client_id
      ) e ON e.client_id = u.id
      LEFT JOIN (
        SELECT client_id,
          count(*) FILTER (WHERE created_at >= ${period.start} AND created_at < ${period.end}) AS total,
          max(created_at) AS last_at
        FROM calls GROUP BY client_id
      ) c ON c.client_id = u.id
      LEFT JOIN (
        SELECT client_id,
          count(*) FILTER (WHERE created_at >= ${period.start} AND created_at < ${period.end}) AS total,
          max(created_at) AS last_at
        FROM appointments WHERE status != 'cancelled' GROUP BY client_id
      ) a ON a.client_id = u.id
      WHERE u.is_admin = false
      ORDER BY last_activity DESC NULLS LAST, u.created_at DESC
    `),
    db.execute(sql`
      SELECT CASE
        WHEN status = 'active' THEN 'paid'
        WHEN status = 'trialing' THEN 'trial'
        ELSE 'none'
      END AS plan, count(*)::int AS count
      FROM users WHERE is_admin = false GROUP BY plan ORDER BY count DESC, plan
    `),
    db.select({ vertical: usersTable.vertical, count: count() }).from(usersTable)
      .where(eq(usersTable.isAdmin, false))
      .groupBy(usersTable.vertical)
      .orderBy(desc(count())),
  ]);

  type SummaryRow = {
    clients: number; active_clients: number; suspended_clients: number; trial_clients: number;
    paid_clients: number; prospects: number; emails: number; calls: number; appointments: number;
  };
  type ClientRow = {
    id: string; email: string | null; business_name: string | null; status: string;
    subscription_plan: string; prospects: number; emails: number; calls: number;
    appointments: number; last_activity: Date | string | null;
  };
  const summary = clientSummary.rows[0] as SummaryRow;
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
      clients: Number(summary.clients),
      activeClients: Number(summary.active_clients),
      suspendedClients: Number(summary.suspended_clients),
      trialClients: Number(summary.trial_clients),
      paidClients: Number(summary.paid_clients),
      prospects: Number(summary.prospects),
      emails: Number(summary.emails),
      calls: Number(summary.calls),
      appointments: Number(summary.appointments),
    },
    dailyActivity,
    clientPerformance: (clientRows.rows as unknown as ClientRow[]).map((row) => ({
      id: row.id,
      email: row.email,
      businessName: row.business_name,
      status: row.status,
      subscriptionPlan: row.subscription_plan,
      prospects: Number(row.prospects),
      emails: Number(row.emails),
      calls: Number(row.calls),
      appointments: Number(row.appointments),
      lastActivity: row.last_activity ? new Date(row.last_activity).toISOString() : null,
    })),
    planBreakdown: (planRows.rows as Array<{ plan: string; count: number }>).map((row) => ({
      label: row.plan,
      count: Number(row.count),
    })),
    verticalBreakdown: verticalRows.map((row) => ({
      label: row.vertical,
      count: row.count,
    })),
  });
});

router.get("/clients", async (_req, res) => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  const clients = await Promise.all(users.map(async (user) => {
    const [prospects] = await db.select({ count: count() }).from(prospectsTable).where(eq(prospectsTable.clientId, user.id));
    const [emails] = await db.select({ count: count() }).from(emailsTable).where(eq(emailsTable.clientId, user.id));
    const [calls] = await db.select({ count: count() }).from(callsTable).where(eq(callsTable.clientId, user.id));
    const [appointments] = await db.select({ count: count() }).from(appointmentsTable).where(eq(appointmentsTable.clientId, user.id));

    const identity = await fetchClerkIdentity(user.id);
    let email = user.email;
    if (!email && identity.email) {
      email = identity.email;
      db.update(usersTable).set({ email }).where(eq(usersTable.id, user.id)).catch(() => {});
    }

    return {
      ...user,
      email,
      accountName: identity.name,
      createdAt: user.createdAt.toISOString(),
      stats: {
        prospects: prospects.count,
        emails: emails.count,
        calls: calls.count,
        appointments: appointments.count,
      },
    };
  }));
  return res.json({ clients });
});

router.patch("/clients/:id", async (req, res) => {
  const { id } = req.params;
  const { status, isAdmin, sendingEmail, callerPilotEnabled, callerDailyLimit, callerMonthlyLimit } = req.body;
  const update: Record<string, any> = {};
  if (status) update.status = status;
  if (typeof isAdmin === "boolean") update.isAdmin = isAdmin;
  if (typeof callerPilotEnabled === "boolean") update.callerPilotEnabled = callerPilotEnabled;
  if (callerDailyLimit !== undefined) {
    if (!Number.isInteger(callerDailyLimit) || callerDailyLimit < 1 || callerDailyLimit > 10000) {
      return res.status(400).json({ error: "callerDailyLimit must be an integer from 1 to 10000" });
    }
    update.callerDailyLimit = callerDailyLimit;
  }
  if (callerMonthlyLimit !== undefined) {
    if (!Number.isInteger(callerMonthlyLimit) || callerMonthlyLimit < 1 || callerMonthlyLimit > 100000) {
      return res.status(400).json({ error: "callerMonthlyLimit must be an integer from 1 to 100000" });
    }
    update.callerMonthlyLimit = callerMonthlyLimit;
  }
  // Admin-managed per-client sending address (the authenticated From: domain
  // provisioned for that client during onboarding). Empty string clears it,
  // reverting the client to the shared platform sending domain.
  if (typeof sendingEmail === "string") {
    const trimmed = sendingEmail.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return res.status(400).json({ error: "Invalid sending email address" });
    }
    update.sendingEmail = trimmed || null;
  }
  const [user] = await db.update(usersTable).set(update).where(eq(usersTable.id, id)).returning();
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ ...user, createdAt: user.createdAt.toISOString() });
});

router.get("/clients/:id/call-campaigns", async (req, res): Promise<void> => {
  const clientId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const campaigns = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.clientId, clientId), eq(campaignsTable.type, "call")))
    .orderBy(desc(campaignsTable.createdAt));
  res.json({
    campaigns: campaigns.map((campaign) => ({
      ...campaign,
      createdAt: campaign.createdAt.toISOString(),
      callScriptApprovedAt: campaign.callScriptApprovedAt?.toISOString() ?? null,
    })),
  });
});

router.post("/clients/:id/call-campaigns/:campaignId/approve-script", async (req, res): Promise<void> => {
  const clientId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const rawCampaignId = Array.isArray(req.params.campaignId) ? req.params.campaignId[0] : req.params.campaignId;
  const campaignId = Number.parseInt(rawCampaignId, 10);
  if (!Number.isInteger(campaignId) || campaignId < 1) {
    res.status(400).json({ error: "Invalid campaign ID" });
    return;
  }
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(and(
      eq(campaignsTable.id, campaignId),
      eq(campaignsTable.clientId, clientId),
      eq(campaignsTable.type, "call"),
    ));
  if (!campaign) {
    res.status(404).json({ error: "Call campaign not found" });
    return;
  }
  const script = campaign.callScript?.trim();
  if (!script) {
    res.status(400).json({ error: "A non-empty call script is required before approval" });
    return;
  }
  const [approved] = await db
    .update(campaignsTable)
    .set({
      callScript: script,
      callScriptApprovedAt: new Date(),
      callScriptApprovedBy: req.clientId,
      callScriptVersion: sql`${campaignsTable.callScriptVersion} + 1`,
    })
    .where(and(eq(campaignsTable.id, campaignId), eq(campaignsTable.clientId, clientId)))
    .returning();
  res.json({
    ...approved,
    createdAt: approved.createdAt.toISOString(),
    callScriptApprovedAt: approved.callScriptApprovedAt?.toISOString() ?? null,
  });
});

router.get("/video-views", async (_req, res) => {
  const views = await db
    .select()
    .from(videoViewsTable)
    .orderBy(desc(videoViewsTable.createdAt))
    .limit(500);
  res.json({ views });
});

router.get("/conversion-funnel", async (req, res) => {
  const requestedDays = Number.parseInt(String(req.query.days ?? "30"), 10);
  const days = Number.isFinite(requestedDays)
    ? Math.min(365, Math.max(1, requestedDays))
    : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const clickResult = await db.execute(sql`
    SELECT intent,
           count(*)::int AS clicks,
           count(DISTINCT visitor_id)::int AS unique_visitors
    FROM conversion_events
    WHERE event_type = 'cta_click'
      AND created_at >= ${since}
    GROUP BY intent
  `);
  const outcomeResult = await db.execute(sql`
    SELECT event_type, intent, count(*)::int AS total
    FROM conversion_events
    WHERE event_type IN ('demo_completed', 'trial_started', 'paid_sale')
      AND created_at >= ${since}
    GROUP BY event_type, intent
  `);
  const accountIntentResult = await db.execute(sql`
    SELECT count(DISTINCT visitor_id)::int AS unique_visitors
    FROM conversion_events
    WHERE event_type = 'cta_click'
      AND intent IN ('start_trial', 'buy_now', 'get_started')
      AND created_at >= ${since}
  `);
  const accountResult = await db.execute(sql`
    SELECT count(*)::int AS total
    FROM users
    WHERE is_admin = false
      AND created_at >= ${since}
  `);

  const clicks = {
    book_demo: { clicks: 0, uniqueVisitors: 0 },
    start_trial: { clicks: 0, uniqueVisitors: 0 },
    buy_now: { clicks: 0, uniqueVisitors: 0 },
    get_started: { clicks: 0, uniqueVisitors: 0 },
  };
  for (const row of clickResult.rows as Array<{ intent: keyof typeof clicks; clicks: number; unique_visitors: number }>) {
    if (row.intent in clicks) {
      clicks[row.intent] = {
        clicks: Number(row.clicks),
        uniqueVisitors: Number(row.unique_visitors),
      };
    }
  }

  let demoRequests = 0;
  let freeTrials = 0;
  let newCustomers = 0;
  for (const row of outcomeResult.rows as Array<{ event_type: string; intent: string; total: number }>) {
    if (row.event_type === "demo_completed") demoRequests += Number(row.total);
    if (row.event_type === "trial_started") freeTrials += Number(row.total);
    if (row.event_type === "paid_sale" && row.intent === "new_customer") {
      newCustomers += Number(row.total);
    }
  }

  const accountIntentVisitors = Number(
    (accountIntentResult.rows[0] as { unique_visitors?: number } | undefined)?.unique_visitors ?? 0,
  );
  const newAccounts = Number((accountResult.rows[0] as { total?: number } | undefined)?.total ?? 0);
  const checkoutResult = await db.execute(sql`
    SELECT count(*)::int AS sessions, count(DISTINCT user_id)::int AS visitors
    FROM conversion_events
    WHERE event_type = 'checkout_started' AND created_at >= ${since}
  `);
  const checkout = checkoutResult.rows[0];
  const calendar = await getCalendarCounts(since);

  return res.json({
    days,
    clicks,
    stripeCheckout: {
      sessions: Number(checkout?.sessions ?? 0),
      visitors: Number(checkout?.visitors ?? 0),
    },
    calendar,
    outcomes: {
      demoRequests,
      newAccounts,
      freeTrials,
      newCustomers,
    },
    estimatedIncomplete: {
      demo: Math.max(0, clicks.book_demo.uniqueVisitors - demoRequests),
      accountSetup: Math.max(0, accountIntentVisitors - newAccounts),
    },
  });
});

export default router;
