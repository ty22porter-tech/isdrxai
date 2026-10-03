import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/requireAuth";

export const adminVisitorActivityRouter = Router();
adminVisitorActivityRouter.use(requireAuth, requireAdmin);
adminVisitorActivityRouter.get("/", async (_req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const since = new Date(Date.now() - 30 * 86400000);
  const result = await db.execute(sql`
    WITH sessions AS (
      SELECT s.*, u.email AS account_email, u.sender_name, u.business_name
      FROM conversion_events s
      LEFT JOIN users u ON u.id = s.user_id
      WHERE s.event_type = 'visitor_session' AND s.created_at >= ${since}
        AND (u.id IS NOT NULL OR s.metadata->>'identitySource' = 'form_submission')
    ), activity AS (
      SELECT s.*, a.total_events, a.last_seen
      FROM sessions s
      JOIN LATERAL (
        SELECT count(*)::int AS total_events, max(e.created_at) AS last_seen
        FROM conversion_events e
        WHERE e.event_type = 'visitor_activity' AND e.visitor_id = s.visitor_id AND e.created_at >= ${since}
      ) a ON true
      ORDER BY coalesce(a.last_seen, s.created_at) DESC LIMIT 100
    )
    SELECT a.id, CASE WHEN a.user_id IS NOT NULL THEN 'signed_in' ELSE 'form_submission' END AS "identitySource",
      CASE WHEN a.user_id IS NOT NULL THEN a.sender_name ELSE a.metadata->>'name' END AS name,
      CASE WHEN a.user_id IS NOT NULL THEN a.account_email ELSE a.metadata->>'email' END AS email,
      CASE WHEN a.user_id IS NOT NULL THEN a.business_name ELSE a.metadata->>'company' END AS company,
      a.created_at AS "firstSeen", coalesce(a.last_seen, a.created_at) AS "lastSeen", a.total_events AS "totalEvents",
      (SELECT coalesce(jsonb_agg(x.entry ORDER BY x.created_at DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('event', e.intent, 'page', e.location, 'at', e.created_at) AS entry, e.created_at
        FROM conversion_events e WHERE e.event_type = 'visitor_activity' AND e.visitor_id = a.visitor_id
          AND e.created_at >= ${since}
        ORDER BY e.created_at DESC, e.id DESC LIMIT 30
      ) x) AS events
    FROM activity a ORDER BY coalesce(a.last_seen, a.created_at) DESC
  `);
  const visitors = result.rows.map(row => ({
    ...row, emailDomain: typeof row.email === "string" ? row.email.split("@")[1]?.toLowerCase() ?? null : null,
  }));
  res.json({ visitors, days: 30, limit: 100 });
});