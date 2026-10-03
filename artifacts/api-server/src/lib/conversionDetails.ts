import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { z } from "zod";

export const ConversionDetailQuery = z.object({
  metric: z.enum(["book_demo", "start_trial", "buy_now", "get_started", "demo_completed", "accounts", "trial_started", "paid_sale", "checkout_started", "calendar_errors", "calendar_unbooked"]),
  days: z.coerce.number().int().min(1).max(365).default(30),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

// Both the summary and drill-down share the same cohort/filter.
// Match booking evidence within tenant + prospect, never across customer accounts.
export function calendarClickCte(since: Date) {
  return sql`
    calendar_clicks AS (
      SELECT 'email:' || c.id AS id, c.clicked_at AS at, c.prospect_id, c.client_id
      FROM link_click_events c JOIN email_links l ON l.id = c.link_id
      WHERE c.is_bot = false AND c.clicked_at >= ${since} AND l.kind = 'cta'
        AND (l.destination ~* '^https?://([a-z0-9-]+[.])*calendly[.]com([/:?#]|$)'
          OR l.destination ~* '^https?://[^/]+/app/schedule/')
      UNION ALL
      SELECT 'calendar:' || e.id, e.created_at, p.id, p.client_id
      FROM conversion_events e JOIN prospects p
        ON p.id::text = e.metadata->>'prospectId' AND p.client_id = e.user_id
      WHERE e.event_type = 'calendar_click' AND e.created_at >= ${since}
    ), unbooked AS (
      SELECT c.* FROM calendar_clicks c
      WHERE NOT EXISTS (
        SELECT 1 FROM appointments a
        WHERE a.client_id = c.client_id AND a.prospect_id = c.prospect_id
          AND a.calendly_invitee_uri IS NOT NULL AND a.created_at >= c.at
      )
    )`;
}

export async function getCalendarCounts(since: Date) {
  const result = await db.execute(sql`
    WITH ${calendarClickCte(since)}
    SELECT (SELECT count(*)::int FROM unbooked) AS unbooked,
      (SELECT count(*)::int FROM conversion_events
        WHERE event_type = 'calendar_error' AND created_at >= ${since}) AS errors
  `);
  return { errors: Number(result.rows[0]?.errors ?? 0), unbooked: Number(result.rows[0]?.unbooked ?? 0) };
}

export async function getConversionDetails(input: z.infer<typeof ConversionDetailQuery>) {
  const since = new Date(Date.now() - input.days * 86400000);
  let rows;
  if (input.metric === "calendar_unbooked") {
    rows = sql`
      SELECT c.id, c.at, p.contact_name AS name, p.email, u.email AS "ownerEmail",
        'link_recipient_not_verified_clicker'::text AS "identitySource",
        'No confirmed Calendly booking since this click'::text AS outcome,
        'Not a proven failure. Recent clicks and delayed or missing booking sync are included. Forwarded links may be used by someone else.'::text AS detail
      FROM unbooked c LEFT JOIN prospects p ON p.id = c.prospect_id AND p.client_id = c.client_id
      LEFT JOIN users u ON u.id = c.client_id`;
  } else if (input.metric === "calendar_errors") {
    rows = sql`
      SELECT 'error:' || e.id AS id, e.created_at AS at, p.contact_name AS name, p.email, u.email AS "ownerEmail",
        CASE WHEN p.id IS NULL THEN 'anonymous' ELSE 'link_recipient_not_verified_clicker' END AS "identitySource",
        'Observed calendar flow error'::text AS outcome, e.metadata->>'reason' AS detail
      FROM conversion_events e
      LEFT JOIN prospects p ON p.id::text = e.metadata->>'prospectId' AND p.client_id = e.user_id
      LEFT JOIN users u ON u.id = e.user_id
      WHERE e.event_type = 'calendar_error' AND e.created_at >= ${since}`;
  } else if (input.metric === "accounts") {
    rows = sql`
      SELECT 'account:' || id AS id, created_at AS at, sender_name AS name, email,
        NULL::text AS "ownerEmail", 'account'::text AS "identitySource",
        'Account created'::text AS outcome, business_name AS detail
      FROM users WHERE is_admin = false AND created_at >= ${since}`;
  } else {
    const cta = ["book_demo", "start_trial", "buy_now", "get_started"].includes(input.metric);
    const where = cta
      ? sql`e.event_type = 'cta_click' AND e.intent = ${input.metric}`
      : input.metric === "paid_sale"
        ? sql`e.event_type = 'paid_sale' AND e.intent = 'new_customer'`
        : sql`e.event_type = ${input.metric}`;
    rows = sql`
      SELECT 'event:' || e.id AS id, e.created_at AS at,
        coalesce(u.sender_name, su.sender_name, s.metadata->>'name') AS name,
        coalesce(u.email, su.email, s.metadata->>'email') AS email,
        NULL::text AS "ownerEmail",
        CASE WHEN u.id IS NOT NULL OR su.id IS NOT NULL THEN 'account'
          WHEN s.metadata->>'identitySource' = 'form_submission' THEN 'self_reported_form_lead'
          ELSE 'anonymous' END AS "identitySource",
        e.event_type AS outcome, e.location AS detail
      FROM conversion_events e
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN conversion_events s ON s.source_key = 'visitor-session:' || (e.metadata->>'activitySessionHash')
        AND s.event_type = 'visitor_session'
      LEFT JOIN users su ON su.id = s.user_id
      WHERE ${where} AND e.created_at >= ${since}`;
  }
  const result = await db.execute(sql`
    WITH ${calendarClickCte(since)}, detail_rows AS (${rows})
    SELECT (SELECT count(*)::int FROM detail_rows) AS total,
      (SELECT coalesce(jsonb_agg(to_jsonb(page)), '[]'::jsonb) FROM (
        SELECT id, at AT TIME ZONE 'UTC' AS at, name, email, "ownerEmail", "identitySource", outcome, detail
        FROM detail_rows ORDER BY at DESC, id DESC LIMIT 50 OFFSET ${input.offset}
      ) page) AS rows
  `);
  return { rows: result.rows[0]?.rows ?? [], total: Number(result.rows[0]?.total ?? 0), offset: input.offset, limit: 50 };
}