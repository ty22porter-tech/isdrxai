import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/requireAuth";
import { verifyCredentials } from "../lib/emailSender";
import type { EmailProvider } from "../lib/emailSender";

const router = Router();
router.use(requireAuth);

router.get("/me", async (req, res) => {
  const user = req.dbUser;
  res.json({
    id: user.id,
    email: user.email,
    status: user.status,
    isAdmin: user.isAdmin,
    stripeCustomerId: user.stripeCustomerId,
    stripeSubscriptionId: user.stripeSubscriptionId,
    createdAt: user.createdAt.toISOString(),
    emailProvider: user.emailProvider,
    outreachEmail: user.outreachEmail,
    calendlyUrl: user.calendlyUrl,
    timezone: user.timezone,
    autopilotEnabled: user.autopilotEnabled,
    hasEmailCredentials: !!(user.outreachEmail && user.outreachAppPassword),
  });
});

router.put("/settings", async (req, res) => {
  const { emailProvider, outreachEmail, outreachAppPassword, calendlyUrl, timezone } = req.body;
  const update: Record<string, any> = {};

  if (emailProvider) update.emailProvider = emailProvider;
  if (outreachEmail) update.outreachEmail = outreachEmail;
  if (outreachAppPassword) update.outreachAppPassword = outreachAppPassword;
  if (typeof calendlyUrl === "string") update.calendlyUrl = calendlyUrl;
  if (timezone) update.timezone = timezone;

  if (outreachEmail && outreachAppPassword) {
    try {
      await verifyCredentials((emailProvider ?? "gmail") as EmailProvider, outreachEmail, outreachAppPassword);
    } catch (err: any) {
      return res.status(400).json({ error: `Email connection failed: ${err.message}. Check your credentials.` });
    }
  }

  const [user] = await db.update(usersTable).set(update).where(eq(usersTable.id, req.clientId)).returning();
  res.json({
    emailProvider: user.emailProvider,
    outreachEmail: user.outreachEmail,
    calendlyUrl: user.calendlyUrl,
    timezone: user.timezone,
    hasEmailCredentials: !!(user.outreachEmail && user.outreachAppPassword),
  });
});

export default router;
