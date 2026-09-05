import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { db, usersTable, prospectsTable, emailsTable, callsTable, appointmentsTable, videoViewsTable } from "@workspace/db";
import { eq, count, desc, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/requireAuth";

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

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
  const { status, isAdmin, sendingEmail } = req.body;
  const update: Record<string, any> = {};
  if (status) update.status = status;
  if (typeof isAdmin === "boolean") update.isAdmin = isAdmin;
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
      AND intent IN ('start_trial', 'get_started')
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

  return res.json({
    days,
    clicks,
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
