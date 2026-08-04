import { db, emailsTable, prospectsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Handles Resend delivery lifecycle webhook events (delivered / bounced /
 * complained), matching them to our email rows via the stored Resend message id.
 */
export async function handleDeliveryWebhookEvent(event: { type?: string; data?: any }): Promise<void> {
  const type = event?.type;
  if (type !== "email.delivered" && type !== "email.bounced" && type !== "email.complained") return;

  const resendId: string | undefined = event.data?.email_id;
  if (!resendId) return;

  const [email] = await db.select().from(emailsTable).where(eq(emailsTable.resendId, resendId));
  if (!email) return;

  const now = new Date();
  if (type === "email.delivered") {
    if (!email.deliveredAt) {
      await db.update(emailsTable).set({ deliveredAt: now }).where(eq(emailsTable.id, email.id));
    }
    return;
  }

  if (type === "email.bounced") {
    await db.update(emailsTable)
      .set({ status: "bounced", bouncedAt: email.bouncedAt ?? now })
      .where(eq(emailsTable.id, email.id));
    // A hard bounce means the address is bad — mark the prospect invalid so no
    // further sends target it (unless they already progressed past outreach).
    await db.update(prospectsTable)
      .set({ status: "invalid" })
      .where(and(eq(prospectsTable.id, email.prospectId), eq(prospectsTable.status, "contacted")));
    logger.info({ emailId: email.id, prospectId: email.prospectId }, "Email bounced — prospect marked invalid");
    return;
  }

  // email.complained — spam complaint: treat exactly like an unsubscribe.
  await db.update(prospectsTable)
    .set({ optedOut: true, optedOutAt: now })
    .where(eq(prospectsTable.id, email.prospectId));
  logger.info({ emailId: email.id, prospectId: email.prospectId }, "Spam complaint — prospect opted out");
}
