import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db, giftManualSequenceStepsTable as steps, giftOutreachRecordsTable as records, giftOutreachSettingsTable as settings, autopilotEnrollmentsTable as enrollments, appointmentsTable, campaignsTable, emailsTable, prospectsTable } from "@workspace/db";
import { DEFAULT_GIFT_SETTINGS, isGiftSendingWindow, stoppedProspect } from "./giftOutreachPolicy";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Store = typeof db | Tx;
type Email = typeof emailsTable.$inferSelect;
type ManualInput = { prospectId: number; campaignId?: number | null; sequenceStep?: number };
export class ManualSequenceGuardError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
/** ORIGINAL sequence numbering: intro=1, followUp1=2, followUp2..6=3..7.
 * Gift display numbering never changes this wire field. Absence explicitly means a one-off.
 */
export function manualSequenceStep(raw: unknown, campaignId?: number | null): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = z.number().int().min(1).max(7).safeParse(raw);
  if (!parsed.success || !campaignId) throw new ManualSequenceGuardError("sequenceStep must be the original campaign step (1–7), with a campaignId", 400);
  return parsed.data;
}
async function clientLock(tx: Tx, clientId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"gift-outreach:" + clientId}))`);
}
async function evaluate(tx: Store, clientId: string, input: ManualInput) {
  if (!input.campaignId) return false;
  const [campaign] = await tx.select().from(campaignsTable).where(and(eq(campaignsTable.id, input.campaignId), eq(campaignsTable.clientId, clientId)));
  if (!campaign) throw new ManualSequenceGuardError("Campaign not found", 404);
  if (input.sequenceStep === undefined) return false; // Independent one-off; no gift cadence inference.
  const [record] = await tx.select().from(records).where(and(eq(records.clientId, clientId), eq(records.prospectId, input.prospectId), eq(records.campaignId, input.campaignId)));
  const [enrollment] = await tx.select().from(enrollments).where(and(eq(enrollments.clientId, clientId), eq(enrollments.prospectId, input.prospectId), eq(enrollments.campaignId, input.campaignId)));
  if (!record && !enrollment?.giftMode) return false; // Preserve ordinary seven-step behavior/window rules.
  const [stored] = await tx.select().from(settings).where(eq(settings.clientId, clientId));
  const config = { ...DEFAULT_GIFT_SETTINGS, ...stored?.settings };
  if (!config.enabled) throw new ManualSequenceGuardError("Gift outreach is disabled. This gift sequence is paused, not converted to the standard sequence.");
  const [prospect] = await tx.select().from(prospectsTable).where(and(eq(prospectsTable.id, input.prospectId), eq(prospectsTable.clientId, clientId)));
  if (!prospect) throw new ManualSequenceGuardError("Prospect not found", 404);
  const [booking] = await tx.select({ id: appointmentsTable.id }).from(appointmentsTable).where(and(eq(appointmentsTable.clientId, clientId), eq(appointmentsTable.prospectId, input.prospectId), inArray(appointmentsTable.status, ["scheduled", "confirmed", "completed"]))).limit(1);
  const [reply] = await tx.select({ id: emailsTable.id }).from(emailsTable).where(and(eq(emailsTable.clientId, clientId), eq(emailsTable.prospectId, input.prospectId), or(eq(emailsTable.status, "replied"), isNotNull(emailsTable.repliedAt)))).limit(1);
  if (record?.status === "stopped" || stoppedProspect(prospect, enrollment) || booking || reply) throw new ManualSequenceGuardError("This gift sequence has stopped because the prospect replied, booked, unsubscribed, or is no longer eligible.");
  if (input.sequenceStep === 2) throw new ManualSequenceGuardError("The original first follow-up is replaced by Step 3 – Gift Follow-Up. Use the gift record prepare/approve/send/skip actions; never POST its email through /emails.");
  // Autopilot owns its own exact progression and idempotency. Never race it from a manual queue.
  if (enrollment?.giftMode) throw new ManualSequenceGuardError("This sequence is managed by Autopilot. Continue or resume it there; independent one-off emails remain available.");
  if (campaign.status !== "active") throw new ManualSequenceGuardError("Campaign must be active before sending a gift sequence step.");
  if (!isGiftSendingWindow(new Date(), config)) throw new ManualSequenceGuardError("Outside the gift sequence's configured sending days or business hours.");
  if (input.sequenceStep === 1) {
    const [prior] = await tx.select({ id: emailsTable.id }).from(emailsTable).where(and(eq(emailsTable.clientId, clientId), eq(emailsTable.prospectId, input.prospectId), eq(emailsTable.campaignId, input.campaignId), inArray(emailsTable.status, ["sent", "delivered", "opened", "replied"]))).limit(1);
    if (prior) throw new ManualSequenceGuardError("Campaign outreach has already started; the introduction cannot be replayed.");
  }
  if (input.sequenceStep >= 3) {
    if (!record || !["sent", "skipped"].includes(record.status)) throw new ManualSequenceGuardError("Resolve the gift action and package follow-up by sending or explicitly skipping it first.");
    let anchor = record.sentAt || record.updatedAt;
    if (input.sequenceStep > 3) {
      const [previous] = await tx.select().from(steps).where(and(eq(steps.clientId, clientId), eq(steps.prospectId, input.prospectId), eq(steps.campaignId, input.campaignId), eq(steps.originalStep, input.sequenceStep - 1), eq(steps.status, "sent")));
      if (!previous?.sentAt) throw new ManualSequenceGuardError("The preceding manual sequence step has not been completed. Refresh the sequence before continuing.");
      anchor = previous.sentAt;
    }
    let delay = 3;
    try {
      const configured = JSON.parse(campaign.callScript || "{}")[`followUp${input.sequenceStep - 1}`]?.dayDelay;
      if (typeof configured === "number" && configured > 0) delay = configured;
    } catch { /* same legacy three-day fallback */ }
    if (Date.now() < anchor.getTime() + delay * 86400000) throw new ManualSequenceGuardError("The campaign's original delay for this follow-up has not elapsed.");
  }
  return true;
}

/**
 * Authenticated POST /emails calls this before the irreversible provider send.
 * Gift sequence requests share the gift sender's advisory lock. A durable claim
 * survives provider/DB uncertainty; it is never automatically resent after a crash.
 * Completed repeated requests return their actual existing email.
 */
export async function guardedManualEmail(
  clientId: string,
  input: ManualInput,
  send: (store: Store, idempotencyKey?: string) => Promise<Email>,
): Promise<Email> {
  if (input.sequenceStep === undefined) {
    await evaluate(db, clientId, input);
    return send(db);
  }
  const ownerToken = randomUUID();
  const claim = await db.transaction(async tx => {
    await clientLock(tx, clientId);
    const [existing] = await tx.select().from(steps).where(and(eq(steps.clientId, clientId), eq(steps.prospectId, input.prospectId), eq(steps.campaignId, input.campaignId!), eq(steps.originalStep, input.sequenceStep!)));
    if (existing) {
      if (existing.status === "sent" && existing.emailId) {
        const [email] = await tx.select().from(emailsTable).where(and(eq(emailsTable.id, existing.emailId), eq(emailsTable.clientId, clientId)));
        if (email) return { email };
      }
      throw new ManualSequenceGuardError("This sequence step is already claimed or its provider outcome is uncertain. Reconcile the existing attempt; it will not be resent.");
    }
    const gift = await evaluate(tx, clientId, input);
    if (!gift) return { standard: true as const };
    const [row] = await tx.insert(steps).values({ clientId, prospectId: input.prospectId, campaignId: input.campaignId!, originalStep: input.sequenceStep!, ownerToken }).returning();
    return { row };
  });
  if ("email" in claim && claim.email) return claim.email;
  // Standard explicit sequences also recheck under the lock, so an opt-in can't
  // arrive between this lookup and sending the old followUp1.
  return db.transaction(async tx => {
    await clientLock(tx, clientId);
    const gift = await evaluate(tx, clientId, input);
    if ("standard" in claim) {
      if (gift) throw new ManualSequenceGuardError("This prospect was just opted into gift outreach. Refresh before sending.");
      return send(tx);
    }
    if (!("row" in claim) || !claim.row) throw new ManualSequenceGuardError("Manual send claim was not created.");
    const [fresh] = await tx.select().from(steps).where(and(eq(steps.id, claim.row.id), eq(steps.ownerToken, ownerToken))).for("update");
    if (!fresh || fresh.status !== "claimed") throw new ManualSequenceGuardError("This manual sequence step has already been submitted.");
    const email = await send(tx, `gift-manual-${fresh.id}-original-step-${input.sequenceStep}`);
    await tx.update(steps).set({ status: "sent", emailId: email.id, sentAt: email.sentAt }).where(eq(steps.id, fresh.id));
    return email;
  });
}