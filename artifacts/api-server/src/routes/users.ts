import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/requireAuth";
import { isResendConfigured, getPlatformFromEmail } from "../lib/emailSender";

const router = Router();
router.use(requireAuth);

router.get("/me", async (req, res) => {
  const user = req.dbUser;
  const resendReady = await isResendConfigured();
  res.json({
    id: user.id,
    email: user.email,
    status: user.status,
    isAdmin: user.isAdmin,
    stripeCustomerId: user.stripeCustomerId,
    stripeSubscriptionId: user.stripeSubscriptionId,
    createdAt: user.createdAt.toISOString(),
    businessName: user.businessName,
    outreachEmail: user.outreachEmail,
    calendlyUrl: user.calendlyUrl,
    timezone: user.timezone,
    autopilotEnabled: user.autopilotEnabled,
    platformEmailReady: resendReady,
    platformFromEmail: getPlatformFromEmail(),
    autopilotReady: resendReady && !!(user.outreachEmail),
  });
});

router.put("/settings", async (req, res) => {
  const { businessName, outreachEmail, calendlyUrl, timezone } = req.body;
  const update: Record<string, any> = {};

  if (typeof businessName === "string") update.businessName = businessName;
  if (typeof outreachEmail === "string") update.outreachEmail = outreachEmail;
  if (typeof calendlyUrl === "string") update.calendlyUrl = calendlyUrl;
  if (timezone) update.timezone = timezone;

  const [user] = await db.update(usersTable).set(update).where(eq(usersTable.id, req.clientId)).returning();
  const resendReady = await isResendConfigured();
  res.json({
    businessName: user.businessName,
    outreachEmail: user.outreachEmail,
    calendlyUrl: user.calendlyUrl,
    timezone: user.timezone,
    platformEmailReady: resendReady,
    autopilotReady: resendReady && !!(user.outreachEmail),
  });
});

export default router;
