import type { Response } from "express";
import { db, calendlyConnectionsTable as connections, appointmentsTable } from "@workspace/db";
import { calendlySyncLocks } from "./calendlyLocks";
import { eq, and, sql } from "drizzle-orm";
import { calendlyRequest } from "./calendlyOAuth";
import { reconcileCalendlyInvitee } from "../routes/calendlyWebhook";

// Bounded and request-driven: survives autoscale sleeping without relying on timers.
export async function syncCalendly(clientId: string) {
  const lock = await calendlySyncLocks.connect();
  const lockKey = `calendly-sync:${clientId}`;
  try {
  const result = await lock.query("select pg_try_advisory_lock(hashtext($1)) as acquired", [lockKey]);
  if (!result.rows[0].acquired) return;
  const [connection] = await db.select().from(connections).where(eq(connections.clientId, clientId));
  if (!connection?.credentials || !connection.userUri) throw new Error("Connect Calendly first.");
  let statusCode = 200;
  const response: Response = { status(code: number) { statusCode = code; return response; },
    json(_data: unknown) { if (statusCode >= 400) throw new Error("Booking processing failed"); return response; } } as unknown as Response;
  try {
    // Recheck existing bookings too: cancellations may affect meetings created months ago.
    const known = await db.select().from(appointmentsTable).where(and(eq(appointmentsTable.clientId, clientId),
      eq(appointmentsTable.type, "calendly_booking"), sql`${appointmentsTable.scheduledAt} >= now() - interval '30 days'`));
    const uris = new Set(known.map(a => a.calendlyInviteeUri).filter((s): s is string => !!s));
    for (const status of ["active", "canceled"]) {
      let page: string | undefined;
      let pages = 0;
      do {
        const params = new URLSearchParams({ user: connection.userUri, status, count: "100",
          min_start_time: new Date(Date.now() - 30 * 86400000).toISOString() });
        if (page) params.set("page_token", page);
        const events = await calendlyRequest(clientId, `/scheduled_events?${params}`);
        for (const event of events.collection ?? []) {
          let inviteePage: string | undefined;
          let inviteePages = 0;
          do {
            const params = new URLSearchParams({ count: "100" });
            if (inviteePage) params.set("page_token", inviteePage);
            const invitees = await calendlyRequest(clientId, `${new URL(event.uri).pathname}/invitees?${params}`);
            for (const invitee of invitees.collection ?? []) uris.add(invitee.uri);
            inviteePage = invitees.pagination?.next_page_token;
            if (++inviteePages >= 20 && inviteePage) throw new Error("Invitee sync limit exceeded.");
          } while (inviteePage);
        }
        page = events.pagination?.next_page_token;
        if (++pages >= 20 && page) throw new Error("Sync limit exceeded; retry required.");
      } while (page);
    }
    for (const uri of uris) await reconcileCalendlyInvitee(clientId, uri, response);
    await db.update(connections).set({ lastSyncAt: new Date(), error: null }).where(eq(connections.clientId, clientId));
  } catch (error) {
    await db.update(connections).set({ error: "Booking sync failed. Retry Sync now or reconnect if authorization has expired." }).where(eq(connections.clientId, clientId));
    throw error;
  }
  } finally {
    await lock.query("select pg_advisory_unlock(hashtext($1))", [lockKey]);
    lock.release();
  }
}