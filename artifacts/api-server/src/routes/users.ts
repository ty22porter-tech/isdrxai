import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/requireAuth";
import { isResendConfigured, getPlatformFromEmail } from "../lib/emailSender";
import { ObjectStorageService } from "../lib/objectStorage";
import { getObjectAclPolicy } from "../lib/objectAcl";

const objectStorage = new ObjectStorageService();

async function normalizeAndOwn(rawPath: string, ownerId: string): Promise<string> {
  const normalized = objectStorage.normalizeObjectEntityPath(rawPath);
  if (!normalized.startsWith("/objects/")) {
    throw new Error("Invalid object path");
  }
  const file = await objectStorage.getObjectEntityFile(normalized);
  const existing = await getObjectAclPolicy(file);
  if (existing && existing.owner && existing.owner !== ownerId) {
    throw new Error("Not the owner of this object");
  }
  return objectStorage.trySetObjectEntityAclPolicy(normalized, {
    owner: ownerId,
    visibility: "public",
  });
}

const router = Router();
router.use(requireAuth);

router.get("/me", async (req, res) => {
  const user = req.dbUser;
  const resendReady = await isResendConfigured();
  res.json({
    id: user.id,
    email: user.email,
    status: user.status,
    trialEndsAt: user.trialEndsAt ? user.trialEndsAt.toISOString() : null,
    isAdmin: user.isAdmin,
    stripeCustomerId: user.stripeCustomerId,
    stripeSubscriptionId: user.stripeSubscriptionId,
    createdAt: user.createdAt.toISOString(),
    businessName: user.businessName,
    senderName: user.senderName,
    phone: user.phone,
    businessAddress: user.businessAddress,
    outreachEmail: user.outreachEmail,
    calendlyUrl: user.calendlyUrl,
    timezone: user.timezone,
    vertical: user.vertical,
    verticalSelected: user.verticalSelected,
    autopilotEnabled: user.autopilotEnabled,
    website: user.website,
    mobilePhone: user.mobilePhone,
    companyLogoPath: user.companyLogoPath,
    profilePhotoPath: user.profilePhotoPath,
    attachments: user.attachments ?? [],
    platformEmailReady: resendReady,
    platformFromEmail: getPlatformFromEmail(),
    autopilotReady: resendReady && !!(user.outreachEmail) && !!(user.businessAddress),
  });
});

router.put("/settings", async (req, res) => {
  const { businessName, senderName, phone, businessAddress, outreachEmail, calendlyUrl, timezone, vertical, website, mobilePhone, companyLogoPath, profilePhotoPath, attachments } = req.body;
  const update: Record<string, any> = {};
  if (typeof website === "string" || website === null) update.website = website ? String(website).trim().slice(0, 300) : null;
  if (typeof mobilePhone === "string" || mobilePhone === null) update.mobilePhone = mobilePhone ? String(mobilePhone).trim().slice(0, 50) : null;

  try {
    if (companyLogoPath === null) update.companyLogoPath = null;
    else if (typeof companyLogoPath === "string" && companyLogoPath) {
      update.companyLogoPath = await normalizeAndOwn(companyLogoPath, req.clientId);
    }

    if (profilePhotoPath === null) update.profilePhotoPath = null;
    else if (typeof profilePhotoPath === "string" && profilePhotoPath) {
      update.profilePhotoPath = await normalizeAndOwn(profilePhotoPath, req.clientId);
    }

    if (Array.isArray(attachments)) {
      if (attachments.length > 10) {
        res.status(400).json({ error: "You can attach up to 10 files." }); return;
      }
      const cleaned = [];
      for (const a of attachments) {
        if (!a || typeof a.path !== "string" || typeof a.name !== "string") {
          res.status(400).json({ error: "Invalid attachment entry." }); return;
        }
        cleaned.push({
          path: await normalizeAndOwn(a.path, req.clientId),
          name: String(a.name).slice(0, 200),
          size: typeof a.size === "number" ? a.size : 0,
          contentType: typeof a.contentType === "string" ? a.contentType : "application/octet-stream",
        });
      }
      update.attachments = cleaned;
    }
  } catch (err) {
    req.log.error({ err }, "Failed to process uploaded files in settings");
    res.status(400).json({ error: "One of the uploaded files could not be saved. Please re-upload and try again." }); return;
  }

  if (vertical === "janitorial" || vertical === "it_services") {
    update.vertical = vertical;
    update.verticalSelected = true;
  }

  if (typeof businessName === "string") update.businessName = businessName;
  if (typeof senderName === "string") update.senderName = senderName;
  if (typeof phone === "string") update.phone = phone;
  if (typeof businessAddress === "string") update.businessAddress = businessAddress;
  if (typeof outreachEmail === "string") update.outreachEmail = outreachEmail;
  if (typeof calendlyUrl === "string") update.calendlyUrl = calendlyUrl;
  if (timezone) update.timezone = timezone;

  const [user] = await db.update(usersTable).set(update).where(eq(usersTable.id, req.clientId)).returning();
  const resendReady = await isResendConfigured();
  res.json({
    businessName: user.businessName,
    senderName: user.senderName,
    phone: user.phone,
    businessAddress: user.businessAddress,
    outreachEmail: user.outreachEmail,
    calendlyUrl: user.calendlyUrl,
    timezone: user.timezone,
    vertical: user.vertical,
    verticalSelected: user.verticalSelected,
    website: user.website,
    mobilePhone: user.mobilePhone,
    companyLogoPath: user.companyLogoPath,
    profilePhotoPath: user.profilePhotoPath,
    attachments: user.attachments ?? [],
    platformEmailReady: resendReady,
    autopilotReady: resendReady && !!(user.outreachEmail) && !!(user.businessAddress),
  });
});

export default router;
