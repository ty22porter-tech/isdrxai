import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/requireAuth";
import { isResendConfigured, getPlatformFromEmail } from "../lib/emailSender";
import { getEngagementSettings, DEFAULT_ENGAGEMENT_SETTINGS } from "../lib/engagementScoring";
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
    step3CaseStudy: user.step3CaseStudy ?? null,
    step5CaseStudy: user.step5CaseStudy ?? null,
    platformEmailReady: resendReady,
    platformFromEmail: getPlatformFromEmail(),
    autopilotReady: resendReady && !!(user.outreachEmail) && !!(user.businessAddress),
    engagementSettings: getEngagementSettings(user),
  });
});

// Engagement Automation settings — validated field-by-field, stored as a
// partial overlay on the server defaults so future default changes flow through.
router.put("/engagement-settings", async (req, res) => {
  const b = req.body ?? {};
  const cur = (req.dbUser.engagementSettings ?? {}) as Record<string, any>;
  const next: Record<string, any> = { ...cur };

  const bool = (k: string) => { if (typeof b[k] === "boolean") next[k] = b[k]; };
  bool("openTrackingEnabled");
  bool("attachmentTrackingEnabled");
  bool("autoFollowUpEnabled");

  const int = (k: string, min: number, max: number) => {
    if (b[k] !== undefined) {
      const v = Math.round(Number(b[k]));
      if (!Number.isFinite(v) || v < min || v > max) throw Object.assign(new Error(`${k} must be between ${min} and ${max}`), { status: 400 });
      next[k] = v;
    }
  };
  try {
    int("mediumMin", 1, 1000);
    int("hotMin", 2, 1000);
    int("dedupWindowMinutes", 1, 1440);
    int("followUpDelayMinutes", 0, 10080);
    int("dailySendCap", 1, 500);
    const med = next.mediumMin ?? DEFAULT_ENGAGEMENT_SETTINGS.mediumMin;
    const hot = next.hotMin ?? DEFAULT_ENGAGEMENT_SETTINGS.hotMin;
    if (hot <= med) throw Object.assign(new Error("The Hot threshold must be higher than the Medium threshold"), { status: 400 });

    if (b.points && typeof b.points === "object") {
      const pts: Record<string, number> = { ...(cur.points ?? {}) };
      for (const key of Object.keys(DEFAULT_ENGAGEMENT_SETTINGS.points)) {
        if (b.points[key] !== undefined) {
          const v = Math.round(Number(b.points[key]));
          if (!Number.isFinite(v) || v < 0 || v > 100) throw Object.assign(new Error(`Point value "${key}" must be between 0 and 100`), { status: 400 });
          pts[key] = v;
        }
      }
      next.points = pts;
    }

    if (b.template && typeof b.template === "object") {
      const tpl: Record<string, string> = { ...(cur.template ?? {}) };
      if (typeof b.template.subject === "string") {
        if (!b.template.subject.trim()) throw Object.assign(new Error("Template subject cannot be empty"), { status: 400 });
        tpl.subject = b.template.subject.slice(0, 200);
      }
      if (typeof b.template.body === "string") {
        if (!b.template.body.trim()) throw Object.assign(new Error("Template body cannot be empty"), { status: 400 });
        tpl.body = b.template.body.slice(0, 5000);
      }
      next.template = tpl;
    }
  } catch (err: any) {
    return res.status(err.status ?? 400).json({ error: err.message });
  }

  const [user] = await db.update(usersTable)
    .set({ engagementSettings: next })
    .where(eq(usersTable.id, req.clientId))
    .returning();
  res.json({ engagementSettings: getEngagementSettings(user) });
});

router.put("/settings", async (req, res) => {
  const { businessName, senderName, phone, businessAddress, outreachEmail, calendlyUrl, timezone, vertical, website, mobilePhone, companyLogoPath, profilePhotoPath, attachments, step3CaseStudy, step5CaseStudy } = req.body;

  const cleanCaseStudy = async (v: any) => ({
    path: await normalizeAndOwn(v.path, req.clientId),
    name: String(v.name).slice(0, 200),
    size: typeof v.size === "number" ? v.size : 0,
    contentType: typeof v.contentType === "string" ? v.contentType : "application/octet-stream",
  });
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

    if (step3CaseStudy === null) update.step3CaseStudy = null;
    else if (step3CaseStudy && typeof step3CaseStudy.path === "string" && typeof step3CaseStudy.name === "string") {
      update.step3CaseStudy = await cleanCaseStudy(step3CaseStudy);
    }

    if (step5CaseStudy === null) update.step5CaseStudy = null;
    else if (step5CaseStudy && typeof step5CaseStudy.path === "string" && typeof step5CaseStudy.name === "string") {
      update.step5CaseStudy = await cleanCaseStudy(step5CaseStudy);
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
    step3CaseStudy: user.step3CaseStudy ?? null,
    step5CaseStudy: user.step5CaseStudy ?? null,
    platformEmailReady: resendReady,
    autopilotReady: resendReady && !!(user.outreachEmail) && !!(user.businessAddress),
  });
});

export default router;
