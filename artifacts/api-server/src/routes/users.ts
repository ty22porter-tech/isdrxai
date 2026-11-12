import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../lib/requireAuth";
import { getVerticalConfig } from "../lib/verticals";
import { archiveSellerProfile, preferencesForIndustrySwitch } from "../lib/sellerIndustryPreferences";
import { isResendConfigured, getPlatformFromEmail } from "../lib/emailSender";
import { getEngagementSettings, DEFAULT_ENGAGEMENT_SETTINGS } from "../lib/engagementScoring";
import { ObjectStorageService } from "../lib/objectStorage";
import { getObjectAclPolicy } from "../lib/objectAcl";
import {
  applySellerIntelligenceSources,
  buildGenericSellerProfile,
  normalizeWebsite,
  SellerIntelligenceEditableSchema,
  type SellerIntelligenceEditable,
  type SellerIntelligenceProfile,
} from "../lib/sellerIntelligence";
import {
  ensureCurrentSellerResearch,
  researchSellerCompany,
  sellerResearchIdentity,
  sellerResearchSameCompany,
  researchedIdentityMatchesPrior,
  sellerResearchWriteSnapshotMatches,
} from "../lib/sellerResearch";

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
    sellerDifferentiatorsInput: user.sellerDifferentiatorsInput,
    sellerServicePriorities: user.sellerServicePriorities,
    sellerIntelligenceStatus: user.sellerIntelligenceProfile?.status ?? "not_analyzed",
    sellerIntelligenceProfile: user.sellerIntelligenceProfile ?? null,
    sellerIntelligenceUpdateFailed: user.sellerIntelligenceProfile?.lastAnalysisAttemptStatus === "failed",
    previousSellerIntelligenceRemainsActive: Boolean(
      user.sellerIntelligenceProfile?.lastAnalysisAttemptStatus === "failed" &&
      (user.sellerIntelligenceProfile.status === "ready" || user.sellerIntelligenceProfile.status === "needs_review"),
    ),
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
  return res.json({ engagementSettings: getEngagementSettings(user) });
});

router.put("/settings", async (req, res) => {
  const {
    businessName, senderName, phone, businessAddress, outreachEmail, calendlyUrl,
    timezone, vertical, website, mobilePhone, companyLogoPath, profilePhotoPath,
    attachments, step3CaseStudy, step5CaseStudy, sellerDifferentiatorsInput,
    sellerServicePriorities,
  } = req.body;

  const cleanCaseStudy = async (v: any) => ({
    path: await normalizeAndOwn(v.path, req.clientId),
    name: String(v.name).slice(0, 200),
    size: typeof v.size === "number" ? v.size : 0,
    contentType: typeof v.contentType === "string" ? v.contentType : "application/octet-stream",
  });
  const update: Record<string, any> = {};
  let websiteAnalysisFailed = false;
  let previousProfileRemainsActive = false;
  const websiteWasIncluded = Object.prototype.hasOwnProperty.call(req.body ?? {}, "website");
  if (websiteWasIncluded) {
    if (website === null || (typeof website === "string" && !website.trim())) {
      // The website is an optional signature/display field. It is not a
      // prerequisite for seller research and changing it never purges facts.
      update.website = null;
    } else if (typeof website === "string") {
      try {
        update.website = normalizeWebsite(website.slice(0, 300));
      } catch (err) {
        return res.status(400).json({ error: err instanceof Error ? err.message : "Enter a valid public website URL." });
      }
    } else {
      return res.status(400).json({ error: "Enter a valid public HTTP(S) website URL." });
    }
  }
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
        return res.status(400).json({ error: "You can attach up to 10 files." });
      }
      const cleaned = [];
      for (const a of attachments) {
        if (!a || typeof a.path !== "string" || typeof a.name !== "string") {
          return res.status(400).json({ error: "Invalid attachment entry." });
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
    return res.status(400).json({ error: "One of the uploaded files could not be saved. Please re-upload and try again." });
  }

  if (vertical === "janitorial" || vertical === "it_services" || vertical === "fleet_wraps" || vertical === "recruiting_staffing" || vertical === "ai_sales_automation") {
    update.vertical = vertical;
    update.verticalSelected = true;
  }

  if (typeof businessName === "string") update.businessName = businessName.trim().slice(0, 240);
  if (typeof senderName === "string") update.senderName = senderName;
  if (typeof phone === "string") update.phone = phone;
  if (typeof businessAddress === "string") update.businessAddress = businessAddress;
  if (typeof outreachEmail === "string") update.outreachEmail = outreachEmail;
  if (typeof calendlyUrl === "string") update.calendlyUrl = calendlyUrl;
  if (typeof sellerDifferentiatorsInput === "string" || sellerDifferentiatorsInput === null) {
    update.sellerDifferentiatorsInput = sellerDifferentiatorsInput?.trim().slice(0, 4000) || null;
  }
  if (typeof sellerServicePriorities === "string" || sellerServicePriorities === null) {
    update.sellerServicePriorities = sellerServicePriorities?.trim().slice(0, 2000) || null;
  }
  if (timezone) update.timezone = timezone;

  // Seller analysis is keyed by Settings business name + Your Industry. A
  // website edit alone deliberately does not enter this branch.
  const [beforeSave] = await db.select().from(usersTable).where(eq(usersTable.id, req.clientId));
  if (!beforeSave) return res.status(404).json({ error: "User settings could not be found." });
  const targetCompanyName = (update.businessName ?? beforeSave.businessName ?? "").trim();
  const targetVertical = getVerticalConfig(update.vertical ?? beforeSave.vertical).key;
  const previousVertical = getVerticalConfig(beforeSave.vertical).key;
  const previousIndustryArchive = beforeSave.sellerProfilesByVertical?.[targetVertical];
  const previous = (targetVertical !== previousVertical
    ? beforeSave.sellerProfilesByVertical?.[targetVertical] ?? null
    : beforeSave.sellerIntelligenceProfile) as SellerIntelligenceProfile | null;
  const businessNameIncluded = typeof businessName === "string";
  const companyChanged = businessNameIncluded
    && (beforeSave.businessName ?? "").trim().toLowerCase() !== targetCompanyName.toLowerCase();
  const verticalChanged = targetVertical !== previousVertical;
  if (verticalChanged) {
    Object.assign(update, preferencesForIndustrySwitch(beforeSave, update, previousIndustryArchive));
    update.sellerIntelligenceProfile = previous ?? buildGenericSellerProfile(
      update.website ?? beforeSave.website, targetVertical,
      "Analyze the seller for this selling industry before using seller-specific claims.", targetCompanyName,
    );
  }
  const shouldResearchSeller = Boolean(targetCompanyName && (
    (targetVertical === "recruiting_staffing" && websiteWasIncluded
      && update.website !== beforeSave.website)
    || companyChanged
    || verticalChanged
    || (!previous && businessNameIncluded)
  ));
  let researchedProfile: SellerIntelligenceProfile | undefined;
  if (shouldResearchSeller) {
    try {
      const analyzed = await researchSellerCompany({
        companyName: targetCompanyName,
        vertical: targetVertical,
        website: update.website ?? beforeSave.website,
      }, { force: true, clientId: req.clientId });
      const keepOverrides = sellerResearchSameCompany(previous, targetCompanyName)
        || researchedIdentityMatchesPrior(analyzed, previous);
      researchedProfile = applySellerIntelligenceSources(analyzed, {
        differentiatorsInput: update.sellerDifferentiatorsInput !== undefined ? update.sellerDifferentiatorsInput : beforeSave.sellerDifferentiatorsInput,
        servicePriorities: update.sellerServicePriorities !== undefined ? update.sellerServicePriorities : beforeSave.sellerServicePriorities,
        ...(keepOverrides && previous?.userOverrides ? {
          userOverrides: previous.userOverrides,
          userEditedAt: previous.userEditedAt,
        } : {}),
      });
    } catch (err) {
      req.log.warn({ err }, "Seller company-name research failed while saving settings");
      websiteAnalysisFailed = true;
      const sameCompany = sellerResearchSameCompany(previous, targetCompanyName);
      const attemptedAt = new Date().toISOString();
      researchedProfile = sameCompany && previous
        ? {
            ...previous,
            sellerIndustry: targetVertical,
            researchIdentity: {
              ...(previous.researchIdentity ?? {}),
              ...sellerResearchIdentity(targetCompanyName, targetVertical),
            },
            researchStatus: "failed",
            researchMethod: "responses_web_search",
            lastAnalysisAttemptStatus: "failed",
            lastAnalysisAttemptAt: attemptedAt,
            analysisError: err instanceof Error ? err.message.slice(0, 200) : "Company-name web research failed.",
          }
        : {
            ...buildGenericSellerProfile(
              update.website ?? beforeSave.website,
              targetVertical,
              err instanceof Error ? err.message : "Company-name web research failed.",
              targetCompanyName,
            ),
            researchIdentity: sellerResearchIdentity(targetCompanyName, targetVertical),
          };
      previousProfileRemainsActive = Boolean(sameCompany && previous
        && (previous.status === "ready" || previous.status === "needs_review"));
    }
  }

  // Serialize the actual write per account. Re-read after the web call so a
  // concurrent save cannot silently attach the wrong company facts.
  let user: typeof usersTable.$inferSelect | undefined;
  try {
    [user] = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`seller-settings:${req.clientId}`}))`);
      const [currentUser] = await tx.select().from(usersTable).where(eq(usersTable.id, req.clientId));
      if (!currentUser) throw new Error("User settings could not be found.");

      const currentPrevious = currentUser.sellerIntelligenceProfile as SellerIntelligenceProfile | null;
      if (researchedProfile && !sellerResearchWriteSnapshotMatches(currentUser, beforeSave)) {
        throw Object.assign(
          new Error("Seller settings changed while company research was running. Your changes were preserved; reload and try again."),
          { status: 409 },
        );
      }
      if (researchedProfile) {
        update.sellerIntelligenceProfile = researchedProfile;
      } else if (!verticalChanged && currentPrevious &&
        (update.sellerDifferentiatorsInput !== undefined || update.sellerServicePriorities !== undefined)) {
        update.sellerIntelligenceProfile = applySellerIntelligenceSources(
          currentPrevious,
          {
            differentiatorsInput: update.sellerDifferentiatorsInput !== undefined ? update.sellerDifferentiatorsInput : currentUser.sellerDifferentiatorsInput,
            servicePriorities: update.sellerServicePriorities !== undefined ? update.sellerServicePriorities : currentUser.sellerServicePriorities,
          },
        );
      }
      // Archive the selected profile before switching; do not import another
      // industry's approved claims, or discard them when the user switches back.
      update.sellerProfilesByVertical = {
        ...(currentUser.sellerProfilesByVertical ?? {}),
        [getVerticalConfig(currentUser.vertical).key]: archiveSellerProfile(currentPrevious, currentUser),
        [targetVertical]: archiveSellerProfile(update.sellerIntelligenceProfile ?? currentPrevious, {
          sellerServicePriorities: update.sellerServicePriorities !== undefined ? update.sellerServicePriorities : currentUser.sellerServicePriorities,
          sellerDifferentiatorsInput: update.sellerDifferentiatorsInput !== undefined ? update.sellerDifferentiatorsInput : currentUser.sellerDifferentiatorsInput,
        }),
      };

      return tx.update(usersTable).set(update).where(eq(usersTable.id, req.clientId)).returning();
    });
  } catch (err: any) {
    if (err?.status === 409) return res.status(409).json({ error: err.message });
    throw err;
  }
  if (!user) return res.status(404).json({ error: "User settings could not be found." });
  websiteAnalysisFailed = user.sellerIntelligenceProfile?.lastAnalysisAttemptStatus === "failed";
  previousProfileRemainsActive = Boolean(
    websiteAnalysisFailed &&
    (user.sellerIntelligenceProfile?.status === "ready" || user.sellerIntelligenceProfile?.status === "needs_review"),
  );
  const resendReady = await isResendConfigured();
  return res.json({
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
    sellerDifferentiatorsInput: user.sellerDifferentiatorsInput,
    sellerServicePriorities: user.sellerServicePriorities,
    sellerIntelligenceStatus: user.sellerIntelligenceProfile?.status ?? "not_analyzed",
    sellerIntelligenceProfile: user.sellerIntelligenceProfile ?? null,
    sellerIntelligenceUpdateFailed: websiteAnalysisFailed,
    previousSellerIntelligenceRemainsActive: previousProfileRemainsActive,
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

router.post("/company-intelligence/refresh", async (req, res) => {
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.clientId));
  const companyName = currentUser?.businessName?.trim()
    || currentUser?.sellerIntelligenceProfile?.researchIdentity?.companyName?.trim()
    || currentUser?.sellerIntelligenceProfile?.sellerCompanyName?.trim();
  if (!currentUser || !companyName) {
    return res.status(400).json({ error: "Save your business name in Settings before researching Company Intelligence." });
  }
  const refreshed = await ensureCurrentSellerResearch(req.clientId, {
    ...currentUser,
    businessName: companyName,
  }, { force: true });
  const profile = refreshed.sellerIntelligenceProfile;
  const failed = profile?.researchStatus === "failed";
  const previousRemainsActive = Boolean(
    failed && (profile?.status === "ready" || profile?.status === "needs_review"),
  );
  if (failed) {
    return res.status(502).json({
      error: previousRemainsActive
        ? "We could not re-research Company Intelligence. Your previous profile is still available."
        : "We could not research this company yet. Please try again later.",
      sellerIntelligenceStatus: profile?.status ?? "limited",
      sellerIntelligenceProfile: profile,
      sellerIntelligenceUpdateFailed: true,
      previousSellerIntelligenceRemainsActive: previousRemainsActive,
    });
  }
  return res.json({
    sellerIntelligenceStatus: profile?.status ?? "limited",
    sellerIntelligenceProfile: profile,
    sellerIntelligenceUpdateFailed: false,
    previousSellerIntelligenceRemainsActive: false,
  });
});

router.put("/company-intelligence", async (req, res) => {
  const sellerUser = await ensureCurrentSellerResearch(req.clientId, req.dbUser);
  const current = sellerUser.sellerIntelligenceProfile as SellerIntelligenceProfile | null;
  if (!current) {
    return res.status(400).json({ error: "Research your seller company before editing Company Intelligence." });
  }
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "sellerCompanyName")
    && String(req.body.sellerCompanyName ?? "").trim() !== String(current.sellerCompanyName ?? "").trim()) {
    return res.status(400).json({ error: "Research Profile Company Name is read-only; update the canonical Business Name in Settings." });
  }
  const parsed = SellerIntelligenceEditableSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Company intelligence contains an invalid or oversized field." });
  }
  const editableKeys: (keyof SellerIntelligenceEditable)[] = [
    "sellerServices", "sellerProducts", "sellerCapabilities",
    "sellerDifferentiators", "sellerCertifications", "sellerIndustriesServed",
    "sellerBusinessOutcomes", "sellerProblemsSolved", "sellerProofPoints",
    "sellerPortfolioExamples", "sellerValuePropositions", "sellerTypicalCustomers",
    "sellerCTAs",
  ];
  const [saved] = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`seller-settings:${req.clientId}`}))`);
    const [lockedUser] = await tx.select().from(usersTable).where(eq(usersTable.id, req.clientId));
    if (!lockedUser?.sellerIntelligenceProfile) {
      return [];
    }
    const lockedCurrent = lockedUser.sellerIntelligenceProfile as SellerIntelligenceProfile;
    const baseline = applySellerIntelligenceSources(lockedCurrent, {
      differentiatorsInput: lockedUser.sellerDifferentiatorsInput,
      servicePriorities: lockedUser.sellerServicePriorities,
      userOverrides: {},
    });
    const userOverrides: Partial<SellerIntelligenceEditable> = { ...(lockedCurrent.userOverrides ?? {}) };
    for (const key of editableKeys) {
      if (JSON.stringify(parsed.data[key]) === JSON.stringify(baseline[key])) {
        delete userOverrides[key];
      } else {
        (userOverrides as Record<string, unknown>)[key] = parsed.data[key];
      }
    }
    const profile = applySellerIntelligenceSources(lockedCurrent, {
      differentiatorsInput: lockedUser.sellerDifferentiatorsInput,
      servicePriorities: lockedUser.sellerServicePriorities,
      userOverrides,
      userEditedAt: new Date().toISOString(),
    });
    return tx.update(usersTable)
      .set({ sellerIntelligenceProfile: profile })
      .where(eq(usersTable.id, req.clientId))
      .returning();
  });
  if (!saved?.sellerIntelligenceProfile) {
    return res.status(400).json({ error: "Research your seller company before editing Company Intelligence." });
  }
  const profile = saved?.sellerIntelligenceProfile as SellerIntelligenceProfile;
  return res.json({
    sellerIntelligenceStatus: profile.status,
    sellerIntelligenceProfile: profile,
  });
});

export default router;
