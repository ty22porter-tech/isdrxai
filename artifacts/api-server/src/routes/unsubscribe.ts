import { Router } from "express";
import { db, prospectsTable, usersTable, autopilotEnrollmentsTable, activityTable } from "@workspace/db";
import { eq, and, inArray, or } from "drizzle-orm";

const router = Router();

// Dual-token lookup helper: match by unsubscribeToken (new capability-scoped token)
// OR scheduleToken (legacy — for emails already delivered before the token split).
// The fallback ensures previously sent unsubscribe links keep working during the
// rollout window. Once all historic campaigns have cycled out of inboxes, the
// scheduleToken fallback can be removed.
function unsubscribeLookup(token: string) {
  return or(
    eq(prospectsTable.unsubscribeToken, token),
    eq(prospectsTable.scheduleToken, token),
  )!;
}

// Public, no auth. Looks up a prospect by their unguessable unsubscribe token so the
// unsubscribe page can show who is being unsubscribed.
// Uses unsubscribeToken (separate from scheduleToken) so that following this
// link does not expose the prospect's scheduling or reply-routing tokens.
router.get("/:token", async (req, res) => {
  const { token } = req.params;
  const [prospect] = await db.select().from(prospectsTable).where(unsubscribeLookup(token));
  if (!prospect) return res.status(404).json({ error: "This unsubscribe link is invalid or expired." });

  const [client] = await db.select().from(usersTable).where(eq(usersTable.id, prospect.clientId));

  res.json({
    companyName: prospect.companyName,
    email: prospect.email,
    businessName: client?.businessName ?? "this sender",
    alreadyUnsubscribed: prospect.optedOut,
  });
});

// Marks the prospect as opted out and stops any active sequences. Idempotent.
// Handles both the in-email link (frontend POST) and one-click List-Unsubscribe
// (RFC 8058) where mail providers POST directly to this URL.
router.post("/:token", async (req, res) => {
  const { token } = req.params;
  const [prospect] = await db.select().from(prospectsTable).where(unsubscribeLookup(token));
  if (!prospect) return res.status(404).json({ error: "This unsubscribe link is invalid or expired." });

  if (!prospect.optedOut) {
    await db.update(prospectsTable)
      .set({ optedOut: true, optedOutAt: new Date(), status: "unsubscribed" })
      .where(eq(prospectsTable.id, prospect.id));

    await db.update(autopilotEnrollmentsTable)
      .set({ status: "unsubscribed" })
      .where(and(
        eq(autopilotEnrollmentsTable.prospectId, prospect.id),
        inArray(autopilotEnrollmentsTable.status, ["active", "replied", "calendly_sent", "paused"]),
      ));

    await db.insert(activityTable).values({
      clientId: prospect.clientId,
      type: "unsubscribed",
      description: `${prospect.companyName} unsubscribed from all outreach`,
      prospectId: prospect.id,
      prospectName: prospect.contactName,
    });
  }

  res.json({ ok: true, message: "You've been unsubscribed and won't receive further emails." });
});

export default router;
