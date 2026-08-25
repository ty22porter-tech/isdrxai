import crypto from "crypto";
import type { Request, Response } from "express";
import { db, appointmentsTable, prospectsTable, activityTable, scoreEventsTable, automationRunsTable } from "@workspace/db";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { recordEngagementEvent, cancelPendingAutomation } from "../lib/engagementScoring";
import { logger } from "../lib/logger";

/**
 * Calendly webhook (invitee.created): when a prospect books directly through
 * the client's Calendly link, record a real appointment + meeting_scheduled
 * engagement event so the dashboard, engagement table, and prospect timeline
 * reflect the booking.
 *
 * Mounted BEFORE express.json() with a raw body so the Calendly signature
 * (HMAC-SHA256 over "t.body" from the Calendly-Webhook-Signature header) can
 * be verified. The key comes from CALENDLY_WEBHOOK_SIGNING_KEY or is set at
 * boot by ensureCalendlyWebhook (lib/calendlyWebhook.ts) when
 * CALENDLY_API_TOKEN auto-registers the subscription. Without a key,
 * production requests are rejected (fail closed); development accepts them
 * with a warning.
 *
 * Idempotency: the invitee URI is stored on the appointment row under a
 * unique index; webhook retries hit onConflictDoNothing, and
 * recordEngagementEvent already caps meeting_scheduled at once per prospect.
 */

function verifySignature(rawBody: Buffer, header: string | undefined, key: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  const expected = crypto.createHmac("sha256", key).update(`${t}.${rawBody.toString("utf8")}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(v1, "hex"));
  } catch {
    return false;
  }
}

async function handleInviteeCanceled(event: any, res: Response): Promise<Response> {
  const payload = event.payload ?? {};
  const inviteeUri: string | undefined = payload.uri;
  if (!inviteeUri) {
    logger.warn("Calendly invitee.canceled missing invitee URI");
    return res.status(200).json({ received: true, ignored: true });
  }

  try {
    // Idempotent: only flips a still-active appointment; retries (or a
    // cancel for an already-cancelled booking) match zero rows.
    const updated = await db
      .update(appointmentsTable)
      .set({ status: "cancelled" })
      .where(and(
        eq(appointmentsTable.calendlyInviteeUri, inviteeUri),
        sql`${appointmentsTable.status} != 'cancelled'`,
      ))
      .returning();

    if (updated.length === 0) {
      // Unknown invitee URI or already cancelled — nothing to do.
      return res.status(200).json({ received: true, matched: false });
    }

    const appt = updated[0];
    const [prospect] = await db
      .select()
      .from(prospectsTable)
      .where(eq(prospectsTable.id, appt.prospectId));

    const rescheduled = payload.rescheduled === true;
    await db.insert(activityTable).values({
      clientId: appt.clientId,
      type: "appointment_cancelled",
      description: `Calendly booking ${rescheduled ? "rescheduled" : "cancelled"}${prospect ? ` by ${prospect.companyName}` : ""}`,
      prospectId: appt.prospectId,
      prospectName: prospect?.contactName ?? null,
    });

    // If this was the prospect's only active appointment (and not a
    // reschedule, where a new invitee.created re-books immediately), roll
    // their status back so the pipeline doesn't show a meeting that no
    // longer exists.
    if (prospect && prospect.status === "appointment_set") {
      const [remaining] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(appointmentsTable)
        .where(and(
          eq(appointmentsTable.prospectId, appt.prospectId),
          sql`${appointmentsTable.status} != 'cancelled'`,
        ));
      if ((remaining?.count ?? 0) === 0) {
        await db
          .update(prospectsTable)
          .set({ status: "contacted" })
          .where(and(eq(prospectsTable.id, prospect.id), eq(prospectsTable.clientId, prospect.clientId)));
      }
    }

    logger.info({ prospectId: appt.prospectId, clientId: appt.clientId, rescheduled }, "Calendly booking cancelled");
    return res.status(200).json({ received: true, matched: true });
  } catch (err) {
    logger.error({ err }, "Calendly invitee.canceled processing failed");
    return res.status(500).json({ error: "Processing failed" });
  }
}

export async function handleCalendlyWebhook(req: Request, res: Response): Promise<Response> {
  const raw = req.body as Buffer;

  const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (signingKey) {
    const ok = verifySignature(raw, req.headers["calendly-webhook-signature"] as string | undefined, signingKey);
    if (!ok) {
      logger.warn("Calendly webhook signature verification failed");
      return res.status(400).json({ error: "Invalid signature" });
    }
  } else if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
    // Fail closed in production: without a signing key we cannot tell real
    // Calendly events from forged bookings posted to a discovered URL.
    logger.error("Calendly webhook rejected — no signing key configured in production (set CALENDLY_API_TOKEN for auto-registration or CALENDLY_WEBHOOK_SIGNING_KEY)");
    return res.status(403).json({ error: "Webhook signature verification not configured" });
  } else {
    logger.warn("CALENDLY_WEBHOOK_SIGNING_KEY not set — accepting Calendly webhook without signature verification (development only)");
  }

  let event: any;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  if (event?.event === "invitee.canceled") {
    return handleInviteeCanceled(event, res);
  }

  if (event?.event !== "invitee.created") {
    // Not a booking event — acknowledge so Calendly doesn't retry.
    return res.status(200).json({ received: true, ignored: true });
  }

  const payload = event.payload ?? {};
  const inviteeEmail: string | undefined = payload.email;
  const inviteeUri: string | undefined = payload.uri;
  const inviteeName: string | undefined = payload.name;
  const scheduledEvent = payload.scheduled_event ?? {};
  const startTime: string | undefined = scheduledEvent.start_time;
  const eventName: string | undefined = scheduledEvent.name;
  const location: string | null =
    scheduledEvent.location?.join_url ?? scheduledEvent.location?.location ?? null;

  if (!inviteeEmail || !inviteeUri || !startTime) {
    logger.warn({ inviteeEmail: !!inviteeEmail, inviteeUri: !!inviteeUri, startTime: !!startTime }, "Calendly invitee.created missing required fields");
    return res.status(200).json({ received: true, ignored: true });
  }

  try {
    // Map the invitee to a prospect by email (case-insensitive). If the same
    // email exists under multiple clients, prefer the prospect with the most
    // recent Calendly-click engagement, then the most recent engagement of any
    // kind, then the newest prospect row.
    const candidates = await db
      .select()
      .from(prospectsTable)
      .where(sql`lower(${prospectsTable.email}) = ${inviteeEmail.trim().toLowerCase()}`);

    if (candidates.length === 0) {
      logger.info({ inviteeUri }, "Calendly booking from unknown email — no matching prospect");
      return res.status(200).json({ received: true, matched: false });
    }

    let prospect = candidates[0];
    if (candidates.length > 1) {
      const ids = candidates.map((c) => c.id);
      const events = await db
        .select({
          prospectId: scoreEventsTable.prospectId,
          eventType: scoreEventsTable.eventType,
          createdAt: scoreEventsTable.createdAt,
        })
        .from(scoreEventsTable)
        .where(inArray(scoreEventsTable.prospectId, ids))
        .orderBy(desc(scoreEventsTable.createdAt));
      const lastCalendlyClick = new Map<number, number>();
      const lastAny = new Map<number, number>();
      for (const e of events) {
        const ts = e.createdAt.getTime();
        if (!lastAny.has(e.prospectId)) lastAny.set(e.prospectId, ts);
        if (e.eventType === "calendly_click" && !lastCalendlyClick.has(e.prospectId)) lastCalendlyClick.set(e.prospectId, ts);
      }
      const rank = (p: typeof prospect) => [
        lastCalendlyClick.get(p.id) ?? 0,
        lastAny.get(p.id) ?? 0,
        p.id,
      ];
      prospect = [...candidates].sort((a, b) => {
        const ra = rank(a), rb = rank(b);
        for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return rb[i] - ra[i];
        return 0;
      })[0];
    }

    // Serialize retries by invitee URI, then check before inserting. This stays
    // idempotent even in an environment where the schema's unique index has not
    // yet been applied; the advisory lock also closes the concurrent-retry race.
    const booking = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${inviteeUri}))`);
      const [existing] = await tx
        .select()
        .from(appointmentsTable)
        .where(eq(appointmentsTable.calendlyInviteeUri, inviteeUri))
        .limit(1);
      if (existing) return { appointment: existing, inserted: false };

      const [appointment] = await tx
        .insert(appointmentsTable)
        .values({
          clientId: prospect.clientId,
          prospectId: prospect.id,
          type: "calendly_booking",
          scheduledAt: new Date(startTime),
          status: "scheduled",
          location,
          notes: [eventName ? `Calendly: ${eventName}` : "Booked via Calendly", inviteeName ? `Invitee: ${inviteeName}` : null]
            .filter(Boolean)
            .join(" — "),
          calendlyInviteeUri: inviteeUri,
        })
        .returning();

      await tx.insert(activityTable).values({
        clientId: prospect.clientId,
        type: "appointment_set",
        description: `Calendly booking confirmed with ${prospect.companyName}`,
        prospectId: prospect.id,
        prospectName: prospect.contactName ?? null,
      });
      await tx
        .update(prospectsTable)
        .set({ status: "appointment_set" })
        .where(and(eq(prospectsTable.id, prospect.id), eq(prospectsTable.clientId, prospect.clientId)));

      return { appointment, inserted: true };
    });

    // meeting_scheduled is once-per-prospect inside recordEngagementEvent, and
    // cancelPendingAutomation is idempotent. Run both for retries too, so a
    // prior delivery that committed the appointment but stopped afterward can
    // safely repair these downstream effects.
    await recordEngagementEvent(prospect.id, "meeting_scheduled", { detail: "Booked via Calendly" });
    await cancelPendingAutomation(prospect.id, "Meeting booked via Calendly");

    const [meetingRecorded] = await db
      .select({ id: scoreEventsTable.id })
      .from(scoreEventsTable)
      .where(and(
        eq(scoreEventsTable.prospectId, prospect.id),
        eq(scoreEventsTable.eventType, "meeting_scheduled"),
      ))
      .limit(1);
    const [pendingAutomation] = await db
      .select({ id: automationRunsTable.id })
      .from(automationRunsTable)
      .where(and(
        eq(automationRunsTable.prospectId, prospect.id),
        eq(automationRunsTable.status, "pending"),
      ))
      .limit(1);
    if (!meetingRecorded || pendingAutomation) {
      throw new Error("Calendly booking follow-up state is incomplete; retry required");
    }

    if (!booking.inserted) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    logger.info({ prospectId: prospect.id, clientId: prospect.clientId }, "Calendly booking recorded");
    return res.status(200).json({ received: true, matched: true });
  } catch (err) {
    logger.error({ err }, "Calendly webhook processing failed");
    return res.status(500).json({ error: "Processing failed" });
  }
}
