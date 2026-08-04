import crypto from "crypto";
import type { Request, Response } from "express";
import { db, appointmentsTable, prospectsTable, activityTable, scoreEventsTable } from "@workspace/db";
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
 * be verified when CALENDLY_WEBHOOK_SIGNING_KEY is set. Without the key we
 * still accept events (the payload alone can't inflate scores beyond one
 * meeting_scheduled per prospect) but log a warning.
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

export async function handleCalendlyWebhook(req: Request, res: Response): Promise<Response> {
  const raw = req.body as Buffer;

  const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (signingKey) {
    const ok = verifySignature(raw, req.headers["calendly-webhook-signature"] as string | undefined, signingKey);
    if (!ok) {
      logger.warn("Calendly webhook signature verification failed");
      return res.status(400).json({ error: "Invalid signature" });
    }
  } else {
    logger.warn("CALENDLY_WEBHOOK_SIGNING_KEY not set — accepting Calendly webhook without signature verification");
  }

  let event: any;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
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

    // Idempotent insert: the unique index on calendly_invitee_uri drops retries.
    const inserted = await db
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
      .onConflictDoNothing({ target: appointmentsTable.calendlyInviteeUri })
      .returning();

    if (inserted.length === 0) {
      // Retry of an event we already processed.
      return res.status(200).json({ received: true, duplicate: true });
    }

    await db.insert(activityTable).values({
      clientId: prospect.clientId,
      type: "appointment_set",
      description: `Calendly booking confirmed with ${prospect.companyName}`,
      prospectId: prospect.id,
      prospectName: prospect.contactName ?? null,
    });
    await db
      .update(prospectsTable)
      .set({ status: "appointment_set" })
      .where(and(eq(prospectsTable.id, prospect.id), eq(prospectsTable.clientId, prospect.clientId)));

    // meeting_scheduled is once-per-prospect inside recordEngagementEvent, and
    // any pending repeated-open follow-up is now moot.
    await recordEngagementEvent(prospect.id, "meeting_scheduled", { detail: "Booked via Calendly" });
    await cancelPendingAutomation(prospect.id, "Meeting booked via Calendly");

    logger.info({ prospectId: prospect.id, clientId: prospect.clientId }, "Calendly booking recorded");
    return res.status(200).json({ received: true, matched: true });
  } catch (err) {
    logger.error({ err }, "Calendly webhook processing failed");
    return res.status(500).json({ error: "Processing failed" });
  }
}
