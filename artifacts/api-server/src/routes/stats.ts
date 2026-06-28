import { Router } from "express";
import { db } from "@workspace/db";
import { prospectsTable, emailsTable, callsTable, appointmentsTable, activityTable } from "@workspace/db";
import { eq, gte, count, sql, and } from "drizzle-orm";
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
  const [appointmentsSet] = await db.select({ count: count() }).from(appointmentsTable).where(eq(appointmentsTable.clientId, cid));
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

router.get("/activity", async (req, res) => {
  const query = GetActivityFeedQueryParams.parse(req.query);
  const limit = query.limit ?? 20;
  const items = await db.select().from(activityTable).where(eq(activityTable.clientId, req.clientId)).orderBy(sql`${activityTable.createdAt} desc`).limit(limit);
  res.json(items.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })));
});

export default router;
