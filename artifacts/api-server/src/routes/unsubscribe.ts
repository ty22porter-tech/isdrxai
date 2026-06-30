import { Router } from "express";
import { db, prospectsTable, usersTable, autopilotEnrollmentsTable, activityTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

const router = Router();

// Public, no auth. Looks up a prospect by their unguessable schedule token so the
// unsubscribe page can show who is being unsubscribed.
router.get("/:token", async (req, res) => {
  const { token } = req.params;
  const [prospect] = await db.select().from(prospectsTable).where(eq(prospectsTable.scheduleToken, token));
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
  const [prospect] = await db.select().from(prospectsTable).where(eq(prospectsTable.scheduleToken, token));
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
